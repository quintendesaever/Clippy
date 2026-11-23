import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const GUILD_RECHECK_MS = 15 * 60 * 1000;

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  nickname?: string;
}

export interface SessionData {
  state?: string;
  user?: DiscordUser;
  guildVerified?: boolean;
  guildCheckedAt?: number;
}

export function oauthStatesMatch(callbackState: unknown, sessionState: unknown): boolean {
  if (typeof callbackState !== "string" || typeof sessionState !== "string") return false;
  if (!callbackState || !sessionState) return false;
  const left = Buffer.from(callbackState);
  const right = Buffer.from(sessionState);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function createRequireSession(deps: {
  botConfirmsGuildMember(userId: string): Promise<boolean | null>;
}): RequestHandler {
  return function requireSession(req: Request, res: Response, next: NextFunction): void {
    const session = req.session as SessionData;
    if (!session?.user || !session.guildVerified) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const now = Date.now();
    const checkedAt = session.guildCheckedAt ?? 0;
    if (now - checkedAt < GUILD_RECHECK_MS) {
      next();
      return;
    }

    void (async () => {
      try {
        const member = await deps.botConfirmsGuildMember(session.user!.id);
        if (member === false) {
          req.session = null;
          res.status(401).json({ error: "Not a guild member" });
          return;
        }
        // member === true, or null (bot/guild not ready) — refresh timestamp only on success
        if (member === true) {
          session.guildCheckedAt = now;
        }
        next();
      } catch (err) {
        console.error("requireSession guild recheck:", err);
        res.status(401).json({ error: "Not authenticated" });
      }
    })();
  };
}
