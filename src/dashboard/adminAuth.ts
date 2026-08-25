import { PermissionFlagsBits, type Client } from "discord.js";
import type { NextFunction, Request, Response } from "express";

export type SessionUser = { id: string };

export function memberHasAdminPermission(permissions: { has(flag: bigint): boolean } | null | undefined): boolean {
  if (!permissions) return false;
  return permissions.has(PermissionFlagsBits.ManageGuild);
}

export async function userIsGuildAdmin(
  client: Client | null,
  guildId: string,
  userId: string
): Promise<boolean> {
  const guild = client?.guilds.cache.get(guildId);
  if (!guild) return false;
  try {
    const member = await guild.members.fetch(userId);
    return memberHasAdminPermission(member.permissions);
  } catch {
    return false;
  }
}

export function createRequireAdmin(options: {
  getClient: () => Client | null;
  getGuildId: () => string;
  getSessionUser: (req: Request) => SessionUser | undefined;
}) {
  return function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    const user = options.getSessionUser(req);
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    void (async () => {
      try {
        const isAdmin = await userIsGuildAdmin(options.getClient(), options.getGuildId(), user.id);
        if (!isAdmin) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
        next();
      } catch (err) {
        console.error("requireAdmin:", err);
        res.status(403).json({ error: "Forbidden" });
      }
    })();
  };
}
