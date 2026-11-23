import path from "node:path";
import express from "express";
import cookieSession from "cookie-session";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { Client } from "discord.js";
import { getDashboardUrl, getGuildId } from "../config.js";
import { createRequireAdmin } from "./adminAuth.js";
import type { DashboardContext } from "./context.js";
import { createGuildLookups } from "./guildLookups.js";
import { createActivitiesRouter } from "./routes/activities.js";
import { createAdminRouter } from "./routes/admin.js";
import { createAnalyticsRouter } from "./routes/analytics.js";
import { createAuthRouter } from "./routes/auth.js";
import { createCalendarRouter } from "./routes/calendar.js";
import { createHealthRouter } from "./routes/health.js";
import { createMeRouter } from "./routes/me.js";
import { createPermissionsRouter } from "./routes/permissions.js";
import { createRequireSession, type SessionData } from "./session.js";

const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT) || 3000;
const CLIENT_ID = process.env.CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.CLIENT_SECRET?.trim();
const SESSION_SECRET = process.env.SESSION_SECRET?.trim();
const DASHBOARD_URL = getDashboardUrl();

let discordClient: Client | null = null;

export function createDashboardApp(): express.Express {
  if (!CLIENT_ID || !CLIENT_SECRET || !SESSION_SECRET) {
    throw new Error("Dashboard requires CLIENT_ID, CLIENT_SECRET, and SESSION_SECRET");
  }

  const app = express();
  app.set("trust proxy", 1);

  // Staging is served over plain HTTP on Tailscale. Helmet's default
  // upgrade-insecure-requests + HSTS force the browser onto HTTPS → white screen.
  const dashboardIsHttps = DASHBOARD_URL.startsWith("https://");

  app.use(
    helmet({
      hsts: dashboardIsHttps ? undefined : false,
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
          upgradeInsecureRequests: dashboardIsHttps ? [] : null,
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
      secure: dashboardIsHttps,
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
  const analyticsLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/auth", authLimiter);
  app.use("/api/", apiLimiter);

  const getClient = () => discordClient;
  const { botConfirmsGuildMember, getGuildMemberDisplayName } = createGuildLookups(getClient);
  const requireSession = createRequireSession({ botConfirmsGuildMember });
  const requireAdmin = createRequireAdmin({
    getClient,
    getGuildId,
    getSessionUser: (req) => (req.session as SessionData)?.user,
  });
  const ctx: DashboardContext = {
    getClient,
    requireSession,
    requireAdmin,
    analyticsLimiter,
    getGuildMemberDisplayName,
  };

  app.use("/api", createHealthRouter(ctx));
  app.use(
    "/api",
    createAuthRouter(ctx, {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      dashboardUrl: DASHBOARD_URL,
    })
  );
  app.use("/api", createMeRouter(ctx));
  app.use("/api", createCalendarRouter(ctx));
  app.use("/api", createActivitiesRouter(ctx));
  app.use("/api", createAnalyticsRouter(ctx, { secure: dashboardIsHttps }));
  app.use("/api", createAdminRouter(ctx));

  app.use(
    "/api/admin/permissions",
    requireSession,
    requireAdmin,
    createPermissionsRouter({
      getClient,
      getGuildId,
    })
  );

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
