import { ChannelType, PermissionsBitField } from "discord.js";

const AUDITABLE_CHANNEL_TYPES = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildCategory,
]);

export type RoleSnapshot = {
  id: string;
  name: string;
  hexColor: string;
  permissions: bigint;
  managed: boolean;
};

export type ChannelSnapshot = {
  id: string;
  name: string;
  type: ChannelType;
  parentId: string | null;
};

export function isAuditableChannelType(type: ChannelType): boolean {
  return AUDITABLE_CHANNEL_TYPES.has(type);
}

export function channelTypeLabel(type: ChannelType): string {
  switch (type) {
    case ChannelType.GuildText:
      return "text";
    case ChannelType.GuildAnnouncement:
      return "announcement";
    case ChannelType.GuildCategory:
      return "category";
    default:
      return `type ${type}`;
  }
}

function permissionNames(bits: bigint): string[] {
  return new PermissionsBitField(bits).toArray();
}

export function summarizeRoleUpdate(before: RoleSnapshot, after: RoleSnapshot): string[] | null {
  if (after.managed || before.managed) return null;
  const details: string[] = [];
  if (before.name !== after.name) {
    details.push(`Name: ${before.name} → ${after.name}`);
  }
  if (before.hexColor !== after.hexColor) {
    details.push(`Color: ${before.hexColor} → ${after.hexColor}`);
  }
  if (before.permissions !== after.permissions) {
    const oldNames = permissionNames(before.permissions);
    const newNames = permissionNames(after.permissions);
    const added = newNames.filter((name) => !oldNames.includes(name));
    const removed = oldNames.filter((name) => !newNames.includes(name));
    const parts: string[] = [];
    if (added.length > 0) {
      const shown = added.slice(0, 6).join(", ");
      parts.push(`+${shown}${added.length > 6 ? "…" : ""}`);
    }
    if (removed.length > 0) {
      const shown = removed.slice(0, 6).join(", ");
      parts.push(`−${shown}${removed.length > 6 ? "…" : ""}`);
    }
    details.push(parts.length > 0 ? `Permissions: ${parts.join("; ")}` : "Permissions updated");
  }
  return details.length > 0 ? details : null;
}

export function summarizeChannelUpdate(
  before: ChannelSnapshot,
  after: ChannelSnapshot
): string[] | null {
  if (!isAuditableChannelType(after.type) && !isAuditableChannelType(before.type)) {
    return null;
  }
  const details: string[] = [];
  if (before.name !== after.name) {
    details.push(`Name: ${before.name} → ${after.name}`);
  }
  if (before.parentId !== after.parentId) {
    const from = before.parentId ? `<#${before.parentId}>` : "none";
    const to = after.parentId ? `<#${after.parentId}>` : "none";
    details.push(`Category: ${from} → ${to}`);
  }
  if (before.type !== after.type) {
    details.push(`Type: ${channelTypeLabel(before.type)} → ${channelTypeLabel(after.type)}`);
  }
  return details.length > 0 ? details : null;
}
