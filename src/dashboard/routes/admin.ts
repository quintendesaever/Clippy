import { Router, type Request, type Response } from "express";
import { getGuildId } from "../../config.js";
import { collectAdminStatus } from "../../health/collectStatus.js";
import { attachStatusHistory } from "../../health/statusHistory.js";
import { loadAdminStatsPayload, loadAdminUsersPayload, parseAdminRangePreset, parseStatsUserIds } from "../adminStats.js";
import { loadDiscordStatsPayload } from "../discordStats.js";
import { applyBotSettingsPatch, loadBotSettingsPayload } from "../botSettings.js";
import { createStatusCollectorDeps, type DashboardContext } from "../context.js";
import type { SessionData } from "../session.js";

export function createAdminRouter(ctx: DashboardContext): Router {
  const router = Router();

  router.get("/admin/status", ctx.requireSession, ctx.requireAdmin, async (_req, res) => {
    const report = await collectAdminStatus(createStatusCollectorDeps(ctx.getClient));
    res.json(attachStatusHistory(report));
  });

  router.get("/admin/stats", ctx.requireSession, ctx.requireAdmin, async (req: Request, res: Response) => {
    try {
      const payload = await loadAdminStatsPayload(
        getGuildId(),
        parseAdminRangePreset(req.query.range),
        ctx.getClient(),
        parseStatsUserIds(req.query.users)
      );
      res.json({
        range: payload.range,
        timezone: payload.timezone,
        from: payload.from,
        to: payload.to,
        users: payload.users,
        activities: payload.activities,
        web: payload.web,
        calendars: payload.calendars,
        dashboardActions: payload.dashboardActions,
        members: payload.memberRows,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load admin stats";
      res.status(500).json({ error: message });
    }
  });

  router.get("/admin/users", ctx.requireSession, ctx.requireAdmin, async (_req: Request, res: Response) => {
    try {
      const payload = await loadAdminUsersPayload(getGuildId(), ctx.getClient());
      res.json({ users: payload.users, timezone: payload.timezone });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load admin users";
      res.status(500).json({ error: message });
    }
  });

  router.get("/admin/discord/stats", ctx.requireSession, ctx.requireAdmin, async (req: Request, res: Response) => {
    try {
      const payload = await loadDiscordStatsPayload(
        getGuildId(),
        parseAdminRangePreset(req.query.range),
        ctx.getClient(),
        parseStatsUserIds(req.query.users)
      );
      res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load Discord stats";
      res.status(500).json({ error: message });
    }
  });

  router.get("/admin/bot-settings", ctx.requireSession, ctx.requireAdmin, async (_req: Request, res: Response) => {
    try {
      const payload = await loadBotSettingsPayload(getGuildId(), ctx.getClient());
      res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load bot settings";
      res.status(500).json({ error: message });
    }
  });

  router.patch("/admin/bot-settings", ctx.requireSession, ctx.requireAdmin, async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const patch = {
        ...(typeof body.timezone === "string" ? { timezone: body.timezone } : {}),
        ...(body.f1 && typeof body.f1 === "object"
          ? {
              f1: {
                ...(typeof body.f1.enabled === "boolean" ? { enabled: body.f1.enabled } : {}),
                ...(body.f1.channelId === null || typeof body.f1.channelId === "string"
                  ? { channelId: body.f1.channelId }
                  : {}),
                ...(body.f1.roleId === null || typeof body.f1.roleId === "string"
                  ? { roleId: body.f1.roleId }
                  : {}),
                ...(body.f1.predictionUrl === null || typeof body.f1.predictionUrl === "string"
                  ? { predictionUrl: body.f1.predictionUrl }
                  : {}),
              },
            }
          : {}),
        ...(body.library && typeof body.library === "object"
          ? {
              library: {
                ...(typeof body.library.enabled === "boolean"
                  ? { enabled: body.library.enabled }
                  : {}),
                ...(body.library.channelId === null || typeof body.library.channelId === "string"
                  ? { channelId: body.library.channelId }
                  : {}),
                ...(typeof body.library.openMinutes === "number"
                  ? { openMinutes: body.library.openMinutes }
                  : {}),
                ...(typeof body.library.closeMinutes === "number"
                  ? { closeMinutes: body.library.closeMinutes }
                  : {}),
              },
            }
          : {}),
        ...(body.logging && typeof body.logging === "object"
          ? {
              logging: {
                ...(typeof body.logging.enabled === "boolean"
                  ? { enabled: body.logging.enabled }
                  : {}),
                ...(body.logging.channelId === null || typeof body.logging.channelId === "string"
                  ? { channelId: body.logging.channelId }
                  : {}),
                ...(typeof body.logging.logMembers === "boolean"
                  ? { logMembers: body.logging.logMembers }
                  : {}),
                ...(typeof body.logging.logRoles === "boolean"
                  ? { logRoles: body.logging.logRoles }
                  : {}),
                ...(typeof body.logging.logChannels === "boolean"
                  ? { logChannels: body.logging.logChannels }
                  : {}),
                ...(typeof body.logging.logBotConfig === "boolean"
                  ? { logBotConfig: body.logging.logBotConfig }
                  : {}),
                ...(typeof body.logging.logCommandErrors === "boolean"
                  ? { logCommandErrors: body.logging.logCommandErrors }
                  : {}),
              },
            }
          : {}),
      };
      const sessionUser = (req.session as SessionData | undefined)?.user;
      const result = await applyBotSettingsPatch(getGuildId(), ctx.getClient(), patch, {
        actor: sessionUser ? { id: sessionUser.id, tag: sessionUser.username } : null,
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result.settings);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save bot settings";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
