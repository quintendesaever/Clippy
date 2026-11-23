import { Router, type Request, type Response } from "express";
import { recordDashboardPageView } from "../analytics/collect.js";
import type { DashboardContext } from "../context.js";
import type { SessionData } from "../session.js";

export function createAnalyticsRouter(ctx: DashboardContext, cfg: { secure: boolean }): Router {
  const router = Router();
  const dashboardIsHttps = cfg.secure;

  router.post("/analytics/pageview", ctx.analyticsLimiter, async (req: Request, res: Response) => {
    const session = req.session as SessionData | undefined;
    const user = session?.user && session.guildVerified ? session.user : undefined;
    const result = await recordDashboardPageView(req, res, {
      user,
      secure: dashboardIsHttps,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true, recorded: result.recorded });
  });

  return router;
}
