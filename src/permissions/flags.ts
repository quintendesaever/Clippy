import { PermissionFlagsBits, PermissionsBitField } from "discord.js";

export const HIGH_RISK_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
] as const;

export const RELEVANT_PERMISSIONS = [
  ...HIGH_RISK_PERMISSIONS,
  PermissionFlagsBits.PinMessages,
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
] as const;

/** ViewChannel plus high-risk bits, used for sibling/category overwrite maps. */
export const OVERWRITE_COMPARE_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  ...HIGH_RISK_PERMISSIONS,
] as const;

const PERMISSION_META: { bit: bigint; key: string; label: string }[] = [
  { bit: PermissionFlagsBits.Administrator, key: "Administrator", label: "Administrator" },
  { bit: PermissionFlagsBits.ManageGuild, key: "ManageGuild", label: "Manage Server" },
  { bit: PermissionFlagsBits.ManageRoles, key: "ManageRoles", label: "Manage Roles" },
  { bit: PermissionFlagsBits.ManageChannels, key: "ManageChannels", label: "Manage Channels" },
  { bit: PermissionFlagsBits.ManageMessages, key: "ManageMessages", label: "Manage Messages" },
  { bit: PermissionFlagsBits.MentionEveryone, key: "MentionEveryone", label: "Mention Everyone" },
  { bit: PermissionFlagsBits.KickMembers, key: "KickMembers", label: "Kick Members" },
  { bit: PermissionFlagsBits.BanMembers, key: "BanMembers", label: "Ban Members" },
  { bit: PermissionFlagsBits.ModerateMembers, key: "ModerateMembers", label: "Timeout Members" },
  { bit: PermissionFlagsBits.PinMessages, key: "PinMessages", label: "Pin Messages" },
  { bit: PermissionFlagsBits.ViewChannel, key: "ViewChannel", label: "View Channel" },
  { bit: PermissionFlagsBits.SendMessages, key: "SendMessages", label: "Send Messages" },
  { bit: PermissionFlagsBits.ReadMessageHistory, key: "ReadMessageHistory", label: "Read Message History" },
];

const LABEL_BY_BIT = new Map(PERMISSION_META.map((entry) => [entry.bit, entry.label]));
const KEY_BY_BIT = new Map(PERMISSION_META.map((entry) => [entry.bit, entry.key]));

export function permissionLabel(bit: bigint): string {
  return LABEL_BY_BIT.get(bit) ?? `Unknown (${bit.toString()})`;
}

export function permissionKey(bit: bigint): string {
  return KEY_BY_BIT.get(bit) ?? `Unknown_${bit.toString()}`;
}

export function hasExplicit(field: bigint, bit: bigint): boolean {
  return new PermissionsBitField(field).has(bit, false);
}

export function maskBits(field: bigint, bits: readonly bigint[]): bigint {
  let masked = 0n;
  for (const bit of bits) {
    if (hasExplicit(field, bit)) masked |= bit;
  }
  return masked;
}

export function listedBits(field: bigint, bits: readonly bigint[]): bigint[] {
  return bits.filter((bit) => hasExplicit(field, bit));
}

export function formatBitList(bits: readonly bigint[]): string {
  if (bits.length === 0) return "none";
  return bits.map((bit) => permissionLabel(bit)).join(", ");
}

export function overwriteCompareMask(field: bigint): bigint {
  return maskBits(field, OVERWRITE_COMPARE_PERMISSIONS);
}
