import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import cookieSession from "cookie-session";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { Client } from "discord.js";
import { supabase } from "../supabase.js";
import { getDashboardUrl, getGuildId } from "../config.js";
import { ensureGuild, getGuildTimezone } from "../stats/helpers.js";
import {
  getShowTypePrefix,
  setShowTypePrefix,
  upsertMember,
} from "../stats/members.js";
import { assertIcsUrlSafe } from "../calendar/icsFetcher.js";
import {
  ActivityValidationError,
  createActivity,
  deleteActivity,
  joinActivity,
  leaveActivity,
  updateActivity,
} from "../calendar/activities.js";
import { getGuildCalendarMembers } from "../calendar/memberCalendars.js";
import { getGuildTimetableForDates } from "../calendar/timetableService.js";
import { serializeEventForApi } from "../calendar/timetableViews.js";
import { inclusiveDaySpan, MAX_TIMETABLE_RANGE_DAYS } from "../../shared/timetable/dates.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT) || 3000;
const CLIENT_ID = process.env.CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.CLIENT_SECRET?.trim();
const SESSION_SECRET = process.env.SESSION_SECRET?.trim();
const DASHBOARD_URL = getDashboardUrl();
const GUILD_RECHECK_MS = 15 * 60 * 1000;

const DISCORD_API = "https://discord.com/api/v10";

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  nickname?: string;
}

interface DiscordGuild {
  id: string;
  name: string;
}

interface SessionData {
  state?: string;
  user?: DiscordUser;
  guildVerified?: boolean;
  guildCheckedAt?: number;
}

let discordClient: Client | null = null;

async function discordUserApi<T>(accessToken: string, apiPath: string): Promise<T> {
  const res = await fetch(`${DISCORD_API}${apiPath}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Discord API ${apiPath}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function userIsGuildMember(accessToken: string, guildId: string): Promise<boolean> {
  const guilds = await discordUserApi<DiscordGuild[]>(accessToken, "/users/@me/guilds");
  return guilds.some((g) => g.id === guildId);
}

async function botConfirmsGuildMember(userId: string): Promise<boolean | null> {
  const guildId = getGuildId();
  const guild = discordClient?.guilds.cache.get(guildId);
  if (!guild) return null;
  try {
    await guild.members.fetch(userId);
    return true;
  } catch {
    return false;
  }
}

async function getGuildMemberDisplayName(userId: string): Promise<string | null> {
  const guildId = getGuildId();
  const guild = discordClient?.guilds.cache.get(guildId);
  if (!guild) return null;
  try {
    const member = await guild.members.fetch(userId);
    return member.displayName;
  } catch {
    return null;
  }
}

function oauthStatesMatch(callbackState: unknown, sessionState: unknown): boolean {
  if (typeof callbackState !== "string" || typeof sessionState !== "string") return false;
  if (!callbackState || !sessionState) return false;
  const left = Buffer.from(callbackState);
  const right = Buffer.from(sessionState);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function requireSession(req: Request, res: Response, next: NextFunction): void {
  const session = req.session as SessionData;
  if (!session?.user || !session.guildVerified) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const now = Date.now();
  const checkedAt = session.guildCheckedAt ?? 0;
  if (now - checkedAt < GUILD_RECHECK_MS) {
    next();
    return;
  }

  void (async () => {
    try {
      const member = await botConfirmsGuildMember(session.user!.id);
      if (member === false) {
        req.session = null;
        res.status(401).json({ error: "Not a guild member" });
        return;
      }
      // member === true, or null (bot/guild not ready) — refresh timestamp only on success
      if (member === true) {
        session.guildCheckedAt = now;
      }
      next();
    } catch (err) {
      console.error("requireSession guild recheck:", err);
      res.status(401).json({ error: "Not authenticated" });
    }
  })();
}

export function createDashboardApp(): express.Express {
  if (!CLIENT_ID || !CLIENT_SECRET || !SESSION_SECRET) {
    throw new Error("Dashboard requires CLIENT_ID, CLIENT_SECRET, and SESSION_SECRET");
  }

  const app = express();
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "https://cdn.discordapp.com", "data:"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cookieSession({
      name: "clippy_session",
      keys: [SESSION_SECRET],
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: isProduction,
      sameSite: "lax",
      httpOnly: true,
    })
  );

  app.use(express.json({ limit: "32kb" }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/auth", authLimiter);
  app.use("/api/", apiLimiter);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/auth/discord", (req: Request, res: Response) => {
    const state = crypto.randomBytes(24).toString("hex");
    (req.session as SessionData).state = state;
    const redirectUri = `${DASHBOARD_URL}/api/auth/callback`;
    const url = new URL("https://discord.com/api/oauth2/authorize");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify guilds");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/callback", async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      const session = req.session as SessionData;
      if (typeof code !== "string" || !code || !oauthStatesMatch(state, session.state)) {
        res.redirect("/?error=invalid_callback");
        return;
      }
      delete session.state;

      const redirectUri = `${DASHBOARD_URL}/api/auth/callback`;
      const body = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!tokenRes.ok) {
        res.redirect("/?error=token_exchange");
        return;
      }

      const tokenData = (await tokenRes.json()) as { access_token: string };
      const accessToken = tokenData.access_token;
      const user = await discordUserApi<DiscordUser>(accessToken, "/users/@me");

      const guildId = getGuildId();
      const isMember = await userIsGuildMember(accessToken, guildId);
      if (!isMember) {
        res.redirect("/?error=not_member");
        return;
      }

      session.user = user;
      session.guildVerified = true;
      session.guildCheckedAt = Date.now();
      res.redirect("/timetable");
    } catch (err) {
      console.error("oauth callback:", err);
      res.redirect("/?error=token_exchange");
    }
  });

  app.post("/api/logout", (req: Request, res: Response) => {
    req.session = null;
    res.json({ ok: true });
  });

  app.get("/api/me", requireSession, async (req: Request, res: Response) => {
    const session = req.session as SessionData;
    const user = session.user!;
    const guildId = getGuildId();
    const nickname = (await getGuildMemberDisplayName(user.id)) ?? user.username;

    await ensureGuild(guildId);
    await upsertMember(guildId, user.id, user.avatar);
    const showTypePrefix = await getShowTypePrefix(guildId, user.id);

    res.json({
      user: { ...user, nickname },
      show_type_prefix: showTypePrefix,
    });
  });

  app.patch("/api/preferences", requireSession, async (req: Request, res: Response) => {
    const session = req.session as SessionData;
    const guildId = getGuildId();
    const userId = session.user!.id;

    if (typeof req.body?.show_type_prefix !== "boolean") {
      res.status(400).json({ error: "show_type_prefix must be a boolean" });
      return;
    }

    await ensureGuild(guildId);
    await upsertMember(guildId, userId, session.user!.avatar);
    const result = await setShowTypePrefix(guildId, userId, req.body.show_type_prefix);
    if ("error" in result) {
      res.status(500).json({ error: result.error });
      return;
    }
    res.json({ show_type_prefix: result.show_type_prefix });
  });

  app.get("/api/calendar", requireSession, async (req: Request, res: Response) => {
    const session = req.session as SessionData;
    const guildId = getGuildId();
    const userId = session.user!.id;

    const { data, error } = await supabase
      .from("member_calendars")
      .select("id, initials, timezone, ics_url, source_type, show_location, created_at, updated_at")
      .eq("guild_id", guildId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ calendar: data });
  });

  app.put("/api/calendar", requireSession, async (req: Request, res: Response) => {
    const session = req.session as SessionData;
    const guildId = getGuildId();
    const userId = session.user!.id;

    const initials = typeof req.body?.initials === "string" ? req.body.initials.trim() : "";
    if (!initials) {
      res.status(400).json({ error: "initials is required" });
      return;
    }

    const icsUrl =
      typeof req.body?.ics_url === "string" && req.body.ics_url.trim()
        ? req.body.ics_url.trim()
        : null;
    if (icsUrl) {
      try {
        await assertIcsUrlSafe(icsUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid ICS URL";
        res.status(400).json({ error: message });
        return;
      }
    }
    let timezone =
      typeof req.body?.timezone === "string" && req.body.timezone.trim()
        ? req.body.timezone.trim()
        : null;
    if (!timezone) {
      timezone = await getGuildTimezone(guildId);
    }

    const showLocation = Boolean(req.body?.show_location);

    await ensureGuild(guildId);
    await upsertMember(guildId, userId, session.user!.avatar);

    const payload = {
      guild_id: guildId,
      user_id: userId,
      initials: initials.slice(0, 32),
      timezone,
      source_type: "url" as const,
      ics_url: icsUrl,
      show_location: showLocation,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("member_calendars")
      .upsert(payload, { onConflict: "guild_id,user_id" })
      .select("id, initials, timezone, ics_url, source_type, show_location, created_at, updated_at")
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ calendar: data });
  });

  app.get("/api/calendars", requireSession, async (_req: Request, res: Response) => {
    const guildId = getGuildId();
    try {
      const rows = await getGuildCalendarMembers(guildId);
      const userIds = rows.map((row) => row.user_id);
      const avatarByUser = new Map<string, string | null>();

      if (userIds.length > 0) {
        const { data: members, error: membersError } = await supabase
          .from("members")
          .select("user_id, avatar_hash")
          .eq("guild_id", guildId)
          .in("user_id", userIds);

        if (membersError) {
          console.error("dashboard: load member avatars:", membersError.message);
        } else {
          for (const member of members ?? []) {
            avatarByUser.set(member.user_id, member.avatar_hash as string | null);
          }
        }
      }

      res.json({
        calendars: rows.map((row) => ({
          user_id: row.user_id,
          initials: row.initials,
          timezone: row.timezone,
          avatar_hash: avatarByUser.get(row.user_id) ?? null,
        })),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load calendars";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/timetable", requireSession, async (req: Request, res: Response) => {
    const session = req.session as SessionData;
    const guildId = getGuildId();
    const viewerUserId = session.user!.id;
    const from =
      typeof req.query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)
        ? req.query.from
        : null;
    const to =
      typeof req.query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)
        ? req.query.to
        : null;

    if (!from || !to) {
      res.status(400).json({ error: "from and to query params are required (YYYY-MM-DD)" });
      return;
    }
    if (from > to) {
      res.status(400).json({ error: "from must be on or before to" });
      return;
    }
    if (inclusiveDaySpan(from, to) > MAX_TIMETABLE_RANGE_DAYS) {
      res.status(400).json({ error: `range must be at most ${MAX_TIMETABLE_RANGE_DAYS} days` });
      return;
    }

    try {
      const timetable = await getGuildTimetableForDates(guildId, from, to);
      const calendarMembers = await getGuildCalendarMembers(guildId);
      const showLocationByUser = new Map(
        calendarMembers.map((member) => [member.user_id, member.show_location] as const)
      );
      const serialize = (event: Parameters<typeof serializeEventForApi>[0]) =>
        serializeEventForApi(event, { viewerUserId, showLocationByUser });

      const eventsByUser: Record<string, ReturnType<typeof serializeEventForApi>[]> = {};
      for (const [userId, events] of timetable.eventsByUser) {
        eventsByUser[userId] = events.map(serialize);
      }
      const activities = timetable.events
        .filter((event) => event.source === "activity")
        .map(serialize);
      res.json({
        events: timetable.events.map(serialize),
        eventsByUser,
        activities,
        members: timetable.members.map((member) => ({
          userId: member.userId,
          initials: member.initials,
          color: member.color,
          error: member.error ?? null,
        })),
        timezone: timetable.guildTimezone,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load timetable";
      res.status(500).json({ error: message });
    }
  });

  function parseActivityBody(body: unknown): {
    title: string;
    start: Date;
    end: Date;
    location?: string | null;
    description?: string | null;
  } {
    const payload = body as Record<string, unknown> | null;
    const title = typeof payload?.title === "string" ? payload.title : "";
    const startRaw = typeof payload?.start === "string" ? payload.start : "";
    const endRaw = typeof payload?.end === "string" ? payload.end : "";
    const start = new Date(startRaw);
    const end = new Date(endRaw);
    return {
      title,
      start,
      end,
      location: typeof payload?.location === "string" ? payload.location : null,
      description: typeof payload?.description === "string" ? payload.description : null,
    };
  }

  app.post("/api/activities", requireSession, async (req: Request, res: Response) => {
    const session = req.session as SessionData;
    const guildId = getGuildId();
    const userId = session.user!.id;

    try {
      const event = await createActivity({
        guildId,
        userId,
        avatarHash: session.user!.avatar,
        input: parseActivityBody(req.body),
      });
      res.status(201).json({
        activity: serializeEventForApi(event, { viewerUserId: userId }),
      });
    } catch (err) {
      if (err instanceof ActivityValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to create activity";
      res.status(500).json({ error: message });
    }
  });

  app.patch("/api/activities/:id", requireSession, async (req: Request, res: Response) => {
    const session = req.session as SessionData;
    const guildId = getGuildId();
    const userId = session.user!.id;
    const activityId = typeof req.params.id === "string" ? req.params.id : "";
    if (!activityId) {
      res.status(400).json({ error: "activity id is required" });
      return;
    }

    try {
      const event = await updateActivity({
        guildId,
        userId,
        activityId,
        input: parseActivityBody(req.body),
      });
      if (!event) {
        res.status(404).json({ error: "Activity not found" });
        return;
      }
      res.json({
        activity: serializeEventForApi(event, { viewerUserId: userId }),
      });
    } catch (err) {
      if (err instanceof ActivityValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to update activity";
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/activities/:id", requireSession, async (req: Request, res: Response) => {
    const session = req.session as SessionData;
    const guildId = getGuildId();
    const userId = session.user!.id;
    const activityId = typeof req.params.id === "string" ? req.params.id : "";
    if (!activityId) {
      res.status(400).json({ error: "activity id is required" });
      return;
    }

    try {
      const deleted = await deleteActivity({ guildId, userId, activityId });
      if (!deleted) {
        res.status(404).json({ error: "Activity not found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete activity";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/activities/:id/join", requireSession, async (req: Request, res: Response) => {
    const session = req.session as SessionData;
    const guildId = getGuildId();
    const userId = session.user!.id;
    const activityId = typeof req.params.id === "string" ? req.params.id : "";
    if (!activityId) {
      res.status(400).json({ error: "activity id is required" });
      return;
    }

    try {
      const joined = await joinActivity({
        guildId,
        userId,
        activityId,
        avatarHash: session.user!.avatar,
      });
      if (!joined) {
        res.status(404).json({ error: "Activity not found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to join activity";
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/activities/:id/join", requireSession, async (req: Request, res: Response) => {
    const session = req.session as SessionData;
    const guildId = getGuildId();
    const userId = session.user!.id;
    const activityId = typeof req.params.id === "string" ? req.params.id : "";
    if (!activityId) {
      res.status(400).json({ error: "activity id is required" });
      return;
    }

    try {
      const result = await leaveActivity({ guildId, userId, activityId });
      if (result === "not_found") {
        res.status(404).json({ error: "Activity not found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof ActivityValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to leave activity";
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/calendar", requireSession, async (req: Request, res: Response) => {
    const session = req.session as SessionData;
    const guildId = getGuildId();
    const userId = session.user!.id;

    const { error } = await supabase
      .from("member_calendars")
      .delete()
      .eq("guild_id", guildId)
      .eq("user_id", userId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  });

  const dashboardDist = path.resolve(process.cwd(), "dashboard/dist");
  app.use(express.static(dashboardDist));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(dashboardDist, "index.html"), (err) => {
      if (err) res.status(404).send("Dashboard not built. Run npm run build:dashboard.");
    });
  });

  return app;
}

export function startDashboardServer(client: Client): void {
  discordClient = client;
  const app = createDashboardApp();
  app.listen(DASHBOARD_PORT, "0.0.0.0", () => {
    console.log(`Dashboard listening on http://0.0.0.0:${DASHBOARD_PORT}`);
  });
}
