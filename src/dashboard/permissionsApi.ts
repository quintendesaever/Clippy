import { Router, type Request, type Response } from "express";
import type { Client, Guild } from "discord.js";
import { evaluateAudit } from "../permissions/evaluate.js";
import { inspectChannel, inspectRole, withBotChannelPermissions } from "../permissions/inspect.js";
import {
  assertJsonSafe,
  toChannelInspectionDto,
  toMemberInspectionDto,
  toOverviewDto,
  toRoleInspectionDto,
} from "../permissions/dto.js";
import {
  botEffectiveOn,
  buildGuildSnapshot,
  inspectGuildMember,
  inspectRoleEffectiveInChannel,
  loadMemberCatalog,
  resolveInspectableChannel,
} from "../permissions/snapshot.js";

export const GUILD_UNAVAILABLE_ERROR = "Server is unavailable";

const SNOWFLAKE = /^\d{17,20}$/;

export type PermissionsApiDeps = {
  getClient: () => Client | null;
  getGuildId: () => string;
};

function sendJson(res: Response, status: number, payload: unknown): void {
  assertJsonSafe(payload);
  res.status(status).json(payload);
}

function parseSnowflake(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!SNOWFLAKE.test(id)) return null;
  return id;
}

function configuredGuild(deps: PermissionsApiDeps): Guild | null {
  const guildId = deps.getGuildId();
  return deps.getClient()?.guilds.cache.get(guildId) ?? null;
}

async function loadSnapshot(guild: Guild) {
  const snapshot = await buildGuildSnapshot(guild);
  return snapshot;
}

export function createPermissionsRouter(deps: PermissionsApiDeps): Router {
  const router = Router();

  router.get("/", async (_req: Request, res: Response) => {
    try {
      const guild = configuredGuild(deps);
      if (!guild) {
        sendJson(res, 503, { error: GUILD_UNAVAILABLE_ERROR });
        return;
      }
      const snapshot = await loadSnapshot(guild);
      const catalog = await loadMemberCatalog(guild);
      const result = evaluateAudit(snapshot);
      sendJson(res, 200, toOverviewDto(snapshot, result, catalog.members, catalog.membersFetchIncomplete));
    } catch (err) {
      console.error("GET /api/admin/permissions:", err);
      sendJson(res, 503, { error: GUILD_UNAVAILABLE_ERROR });
    }
  });

  router.get("/roles/:roleId", async (req: Request, res: Response) => {
    try {
      const roleId = parseSnowflake(req.params.roleId);
      if (!roleId) {
        sendJson(res, 400, { error: "Invalid role id" });
        return;
      }
      const guild = configuredGuild(deps);
      if (!guild) {
        sendJson(res, 503, { error: GUILD_UNAVAILABLE_ERROR });
        return;
      }
      const snapshot = await loadSnapshot(guild);
      const inspection = inspectRole(snapshot, roleId, { overrideLimit: null });
      if (!inspection) {
        sendJson(res, 404, { error: "Role not found in this server" });
        return;
      }
      sendJson(res, 200, toRoleInspectionDto(inspection));
    } catch (err) {
      console.error("GET /api/admin/permissions/roles:", err);
      sendJson(res, 503, { error: GUILD_UNAVAILABLE_ERROR });
    }
  });

  router.get("/channels/:channelId", async (req: Request, res: Response) => {
    try {
      const channelId = parseSnowflake(req.params.channelId);
      if (!channelId) {
        sendJson(res, 400, { error: "Invalid channel id" });
        return;
      }
      const guild = configuredGuild(deps);
      if (!guild) {
        sendJson(res, 503, { error: GUILD_UNAVAILABLE_ERROR });
        return;
      }
      const resolved = await resolveInspectableChannel(guild, channelId);
      if (!resolved.ok) {
        const status = resolved.message.includes("could not find") ? 404 : 400;
        sendJson(res, status, { error: resolved.message });
        return;
      }
      const snapshot = await loadSnapshot(guild);
      const inspection = inspectChannel(snapshot, resolved.channel.id);
      if (!inspection) {
        sendJson(res, 404, { error: "Channel not found in this server" });
        return;
      }
      const bot = botEffectiveOn(resolved.channel, guild);
      const withBot = withBotChannelPermissions(inspection, bot.botEffective, bot.botCanView);
      const roleEffective = inspectRoleEffectiveInChannel(guild, snapshot, resolved.channel);
      sendJson(res, 200, toChannelInspectionDto(snapshot, withBot, roleEffective));
    } catch (err) {
      console.error("GET /api/admin/permissions/channels:", err);
      sendJson(res, 503, { error: GUILD_UNAVAILABLE_ERROR });
    }
  });

  router.get("/members/:userId", async (req: Request, res: Response) => {
    try {
      const userId = parseSnowflake(req.params.userId);
      const channelId = parseSnowflake(typeof req.query.channelId === "string" ? req.query.channelId : "");
      if (!userId) {
        sendJson(res, 400, { error: "Invalid member id" });
        return;
      }
      if (!channelId) {
        sendJson(res, 400, { error: "channelId is required" });
        return;
      }
      const guild = configuredGuild(deps);
      if (!guild) {
        sendJson(res, 503, { error: GUILD_UNAVAILABLE_ERROR });
        return;
      }
      const resolved = await resolveInspectableChannel(guild, channelId);
      if (!resolved.ok) {
        const status = resolved.message.includes("could not find") ? 404 : 400;
        sendJson(res, status, { error: resolved.message });
        return;
      }
      const inspection = await inspectGuildMember(guild, userId, resolved.channel);
      if ("error" in inspection) {
        sendJson(res, 404, { error: inspection.error });
        return;
      }
      sendJson(res, 200, toMemberInspectionDto(inspection));
    } catch (err) {
      console.error("GET /api/admin/permissions/members:", err);
      sendJson(res, 503, { error: GUILD_UNAVAILABLE_ERROR });
    }
  });

  return router;
}
