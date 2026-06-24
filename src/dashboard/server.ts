import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import cookieSession from "cookie-session";
import { supabase } from "../supabase.js";
import { getDashboardUrl, getGuildId } from "../config.js";
import { getGuildTimezone } from "../stats/helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT) || 3000;
const CLIENT_ID = process.env.CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.CLIENT_SECRET?.trim();
const SESSION_SECRET = process.env.SESSION_SECRET?.trim();
const DASHBOARD_URL = getDashboardUrl();

const DISCORD_API = "https://discord.com/api/v10";

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
}

interface DiscordGuild {
  id: string;
  name: string;
}

interface SessionData {
  access_token?: string;
  state?: string;
  user?: DiscordUser;
}

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

async function requireGuildMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  const session = req.session as SessionData;
  if (!session?.access_token || !session.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const guildId = getGuildId();
    const isMember = await userIsGuildMember(session.access_token, guildId);
    if (!isMember) {
      res.status(403).json({ error: "Not a member of this server" });
      return;
    }
    next();
  } catch (err) {
    console.error("guild membership check:", err);
    res.status(500).json({ error: "Server configuration error" });
  }
}

export function createDashboardApp(): express.Express {
  if (!CLIENT_ID || !CLIENT_SECRET || !SESSION_SECRET) {
    throw new Error("Dashboard requires CLIENT_ID, CLIENT_SECRET, and SESSION_SECRET");
  }

  const app = express();
  app.set("trust proxy", 1);

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

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/auth/discord", (req: Request, res: Response) => {
    const state = Math.random().toString(36).slice(2);
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
    const { code, state } = req.query as { code?: string; state?: string };
    const session = req.session as SessionData;
    if (!code || state !== session.state) {
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
    session.access_token = tokenData.access_token;
    const user = await discordUserApi<DiscordUser>(tokenData.access_token, "/users/@me");
    session.user = user;

    const guildId = getGuildId();
    const isMember = await userIsGuildMember(tokenData.access_token, guildId);
    if (!isMember) {
      session.access_token = undefined;
      session.user = undefined;
      res.redirect("/?error=not_member");
      return;
    }

    res.redirect("/settings");
  });

  app.post("/api/logout", (req: Request, res: Response) => {
    req.session = null;
    res.json({ ok: true });
  });

  app.get("/api/me", requireGuildMember, (req: Request, res: Response) => {
    const session = req.session as SessionData;
    res.json({ user: session.user });
  });

  app.get("/api/calendar", requireGuildMember, async (_req: Request, res: Response) => {
    const session = _req.session as SessionData;
    const guildId = getGuildId();
    const userId = session.user!.id;

    const { data, error } = await supabase
      .from("member_calendars")
      .select("id, initials, timezone, ics_url, source_type, created_at, updated_at")
      .eq("guild_id", guildId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ calendar: data });
  });

  app.put("/api/calendar", requireGuildMember, async (req: Request, res: Response) => {
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
    let timezone =
      typeof req.body?.timezone === "string" && req.body.timezone.trim()
        ? req.body.timezone.trim()
        : null;
    if (!timezone) {
      timezone = await getGuildTimezone(guildId);
    }

    const payload = {
      guild_id: guildId,
      user_id: userId,
      initials: initials.slice(0, 32),
      timezone,
      source_type: "url" as const,
      ics_url: icsUrl,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("member_calendars")
      .upsert(payload, { onConflict: "guild_id,user_id" })
      .select("id, initials, timezone, ics_url, source_type, created_at, updated_at")
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ calendar: data });
  });

  app.delete("/api/calendar", requireGuildMember, async (req: Request, res: Response) => {
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

  const dashboardDist = path.resolve(__dirname, "../../dashboard/dist");
  app.use(express.static(dashboardDist));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(dashboardDist, "index.html"), (err) => {
      if (err) res.status(404).send("Dashboard not built. Run npm run build:dashboard.");
    });
  });

  return app;
}

export function startDashboardServer(): void {
  const app = createDashboardApp();
  app.listen(DASHBOARD_PORT, "0.0.0.0", () => {
    console.log(`Dashboard listening on http://0.0.0.0:${DASHBOARD_PORT}`);
  });
}
