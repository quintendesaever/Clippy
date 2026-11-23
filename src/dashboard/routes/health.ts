import { Router } from "express";
import { collectStatus } from "../../health/collectStatus.js";
import { attachStatusHistory } from "../../health/statusHistory.js";
import { createStatusCollectorDeps, type DashboardContext } from "../context.js";

export function createHealthRouter(ctx: DashboardContext): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.get("/status", async (req, res) => {
    const report = await collectStatus(createStatusCollectorDeps(ctx.getClient));
    const payload = attachStatusHistory(report);
    const ready = req.query.ready === "1" || req.query.ready === "true";
    if (ready && report.status === "unavailable") {
      res.status(503).json(payload);
      return;
    }
    res.json(payload);
  });

  return router;
}
