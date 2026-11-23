import { Router, type Request, type Response } from "express";
import { getGuildId } from "../../config.js";
import { ensureGuild } from "../../stats/helpers.js";
import {
  getShareLocation,
  getShowTypePrefix,
  setShareLocation,
  setShowTypePrefix,
  upsertMember,
} from "../../stats/members.js";
import { userIsGuildAdmin } from "../adminAuth.js";
import type { DashboardContext } from "../context.js";
import type { SessionData } from "../session.js";

export function createMeRouter(ctx: DashboardContext): Router {
  const router = Router();

  router.get("/me", ctx.requireSession, async (req: Request, res: Response) => {
    const session = req.session as SessionData;
    const user = session.user!;
    const guildId = getGuildId();
    const nickname = (await ctx.getGuildMemberDisplayName(user.id)) ?? user.username;

    await ensureGuild(guildId);
    await upsertMember(guildId, user.id, user.avatar);
    const [showTypePrefix, shareLocation, isAdmin] = await Promise.all([
      getShowTypePrefix(guildId, user.id),
      getShareLocation(guildId, user.id),
      userIsGuildAdmin(ctx.getClient(), guildId, user.id),
    ]);

    res.json({
      user: { ...user, nickname },
      show_type_prefix: showTypePrefix,
      share_location: shareLocation,
      is_admin: isAdmin,
    });
  });

  router.patch("/preferences", ctx.requireSession, async (req: Request, res: Response) => {
    const session = req.session as SessionData;
    const guildId = getGuildId();
    const userId = session.user!.id;

    const hasPrefix = typeof req.body?.show_type_prefix === "boolean";
    const hasShare = typeof req.body?.share_location === "boolean";
    if (!hasPrefix && !hasShare) {
      res.status(400).json({ error: "show_type_prefix or share_location is required" });
      return;
    }

    await ensureGuild(guildId);
    await upsertMember(guildId, userId, session.user!.avatar);

    let showTypePrefix = await getShowTypePrefix(guildId, userId);
    let shareLocation = await getShareLocation(guildId, userId);

    if (hasPrefix) {
      const result = await setShowTypePrefix(guildId, userId, req.body.show_type_prefix);
      if ("error" in result) {
        res.status(500).json({ error: result.error });
        return;
      }
      showTypePrefix = result.show_type_prefix;
    }
    if (hasShare) {
      const result = await setShareLocation(guildId, userId, req.body.share_location);
      if ("error" in result) {
        res.status(500).json({ error: result.error });
        return;
      }
      shareLocation = result.share_location;
    }

    res.json({ show_type_prefix: showTypePrefix, share_location: shareLocation });
  });

  return router;
}
