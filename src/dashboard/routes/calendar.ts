import { Router, type Request, type Response } from "express";
import { supabase } from "../../supabase.js";
import { getGuildId } from "../../config.js";
import { ensureGuild, getGuildTimezone } from "../../stats/helpers.js";
import {
  getMemberLocationPrivacy,
  getShareLocation,
  setShareLocation,
  upsertMember,
} from "../../stats/members.js";
import { recordAnalyticsEvent } from "../analytics/events.js";
import { userIsGuildAdmin } from "../adminAuth.js";
import {
  filterPersonalTimetablePayload,
  parseTimetableScope,
  sharedTimetableRequiresIcs,
} from "../timetableScope.js";
import { assertIcsUrlSafe } from "../../calendar/icsFetcher.js";
import { getGuildCalendarMembers, memberHasConnectedIcs } from "../../calendar/memberCalendars.js";
import { getGuildTimetableForDates } from "../../calendar/timetableService.js";
import { serializeEventForApi } from "../../calendar/serializeEvent.js";
import { inclusiveDaySpan, MAX_TIMETABLE_RANGE_DAYS } from "../../../shared/timetable/dates.js";
import type { DashboardContext } from "../context.js";
import type { SessionData } from "../session.js";

export function createCalendarRouter(ctx: DashboardContext): Router {
  const router = Router();

  router.get("/calendar", ctx.requireSession, async (req: Request, res: Response) => {
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

  router.put("/calendar", ctx.requireSession, async (req: Request, res: Response) => {
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

    await ensureGuild(guildId);
    await upsertMember(guildId, userId, session.user!.avatar);

    let shareLocation = await getShareLocation(guildId, userId);
    if (typeof req.body?.show_location === "boolean") {
      const result = await setShareLocation(guildId, userId, req.body.show_location);
      if ("share_location" in result) shareLocation = result.share_location;
    }

    const payload = {
      guild_id: guildId,
      user_id: userId,
      initials: initials.slice(0, 32),
      timezone,
      source_type: "url" as const,
      ics_url: icsUrl,
      show_location: shareLocation,
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
    recordAnalyticsEvent({
      guildId,
      userId,
      source: "dashboard",
      eventType: "calendar.save",
      metadata: { hasIcs: Boolean(icsUrl) },
    });
    res.json({ calendar: data });
  });

  router.get("/calendars", ctx.requireSession, async (_req: Request, res: Response) => {
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

  router.get("/timetable", ctx.requireSession, async (req: Request, res: Response) => {
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

    const scope = parseTimetableScope(req.query.scope);

    try {
      if (sharedTimetableRequiresIcs(scope)) {
        const hasIcs = await memberHasConnectedIcs(guildId, viewerUserId);
        if (!hasIcs) {
          res.status(403).json({
            error: "ICS calendar connection required",
            code: "ics_required",
          });
          return;
        }
      }

      const timetable = await getGuildTimetableForDates(guildId, from, to);
      const { shareLocationByUser, memberGeoByUser } = await getMemberLocationPrivacy(guildId);
      const viewerIsAdmin = await userIsGuildAdmin(ctx.getClient(), guildId, viewerUserId);
      const serialize = (event: Parameters<typeof serializeEventForApi>[0]) =>
        serializeEventForApi(event, {
          viewerUserId,
          viewerIsAdmin,
          shareLocationByUser,
          memberGeoByUser,
        });

      const eventsByUser: Record<string, ReturnType<typeof serializeEventForApi>[]> = {};
      for (const [userId, events] of timetable.eventsByUser) {
        eventsByUser[userId] = events.map(serialize);
      }
      const activities = timetable.events
        .filter((event) => event.source === "activity")
        .map(serialize);
      const members = timetable.members.map((member) => ({
        userId: member.userId,
        initials: member.initials,
        color: member.color,
        error: member.error ?? null,
      }));

      if (scope === "personal") {
        res.json({
          ...filterPersonalTimetablePayload(viewerUserId, eventsByUser, activities, members),
          timezone: timetable.guildTimezone,
        });
        return;
      }

      res.json({
        events: timetable.events.map(serialize),
        eventsByUser,
        activities,
        members,
        timezone: timetable.guildTimezone,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load timetable";
      res.status(500).json({ error: message });
    }
  });

  router.delete("/calendar", ctx.requireSession, async (req: Request, res: Response) => {
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
    recordAnalyticsEvent({
      guildId,
      userId,
      source: "dashboard",
      eventType: "calendar.delete",
      metadata: {},
    });
    res.json({ ok: true });
  });

  return router;
}
