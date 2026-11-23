import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { getGuildId } from "../../config.js";
import { oauthStatesMatch, type DiscordUser, type SessionData } from "../session.js";
import type { DashboardContext } from "../context.js";

const DISCORD_API = "https://discord.com/api/v10";

interface DiscordGuild {
  id: string;
  name: string;
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

export function createAuthRouter(
  _ctx: DashboardContext,
  cfg: { clientId: string; clientSecret: string; dashboardUrl: string }
): Router {
  const router = Router();
  const { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, dashboardUrl: DASHBOARD_URL } = cfg;

  router.get("/auth/discord", (req: Request, res: Response) => {
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

  router.get("/auth/callback", async (req: Request, res: Response) => {
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

  router.post("/logout", (req: Request, res: Response) => {
    req.session = null;
    res.json({ ok: true });
  });

  return router;
}
