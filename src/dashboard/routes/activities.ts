import { Router, type Request, type Response } from "express";
import { getGuildId } from "../../config.js";
import { getMemberLocationPrivacy } from "../../stats/members.js";
import { recordAnalyticsEvent } from "../analytics/events.js";
import {
  ActivityValidationError,
  createActivity,
  deleteActivity,
  joinActivity,
  leaveActivity,
  updateActivity,
} from "../../calendar/activities.js";
import { serializeEventForApi } from "../../calendar/serializeEvent.js";
import type { DashboardContext } from "../context.js";
import type { SessionData } from "../session.js";

export function createActivitiesRouter(ctx: DashboardContext): Router {
  const router = Router();

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

  router.post("/activities", ctx.requireSession, async (req: Request, res: Response) => {
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
      if (event.id) {
        recordAnalyticsEvent({
          guildId,
          userId,
          source: "dashboard",
          eventType: "activity.create",
          metadata: { activityId: event.id },
        });
      }
      const { shareLocationByUser, memberGeoByUser } = await getMemberLocationPrivacy(guildId);
      res.status(201).json({
        activity: serializeEventForApi(event, {
          viewerUserId: userId,
          shareLocationByUser,
          memberGeoByUser,
        }),
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

  router.patch("/activities/:id", ctx.requireSession, async (req: Request, res: Response) => {
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
      recordAnalyticsEvent({
        guildId,
        userId,
        source: "dashboard",
        eventType: "activity.update",
        metadata: { activityId },
      });
      const { shareLocationByUser, memberGeoByUser } = await getMemberLocationPrivacy(guildId);
      res.json({
        activity: serializeEventForApi(event, {
          viewerUserId: userId,
          shareLocationByUser,
          memberGeoByUser,
        }),
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

  router.delete("/activities/:id", ctx.requireSession, async (req: Request, res: Response) => {
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
      recordAnalyticsEvent({
        guildId,
        userId,
        source: "dashboard",
        eventType: "activity.delete",
        metadata: { activityId },
      });
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete activity";
      res.status(500).json({ error: message });
    }
  });

  router.post("/activities/:id/join", ctx.requireSession, async (req: Request, res: Response) => {
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
      recordAnalyticsEvent({
        guildId,
        userId,
        source: "dashboard",
        eventType: "activity.join",
        metadata: { activityId },
      });
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to join activity";
      res.status(500).json({ error: message });
    }
  });

  router.delete("/activities/:id/join", ctx.requireSession, async (req: Request, res: Response) => {
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
      recordAnalyticsEvent({
        guildId,
        userId,
        source: "dashboard",
        eventType: "activity.leave",
        metadata: { activityId },
      });
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

  return router;
}
