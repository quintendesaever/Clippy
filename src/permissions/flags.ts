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

const LABELS: { bit: bigint; label: string }[] = [
  { bit: PermissionFlagsBits.Administrator, label: "Administrator" },
  { bit: PermissionFlagsBits.ManageGuild, label: "Manage Server" },
  { bit: PermissionFlagsBits.ManageRoles, label: "Manage Roles" },
  { bit: PermissionFlagsBits.ManageChannels, label: "Manage Channels" },
  { bit: PermissionFlagsBits.ManageMessages, label: "Manage Messages" },
  { bit: PermissionFlagsBits.MentionEveryone, label: "Mention Everyone" },
  { bit: PermissionFlagsBits.KickMembers, label: "Kick Members" },
  { bit: PermissionFlagsBits.BanMembers, label: "Ban Members" },
  { bit: PermissionFlagsBits.ModerateMembers, label: "Timeout Members" },
  { bit: PermissionFlagsBits.PinMessages, label: "Pin Messages" },
  { bit: PermissionFlagsBits.ViewChannel, label: "View Channel" },
  { bit: PermissionFlagsBits.SendMessages, label: "Send Messages" },
  { bit: PermissionFlagsBits.ReadMessageHistory, label: "Read Message History" },
];

const LABEL_BY_BIT = new Map(LABELS.map((entry) => [entry.bit, entry.label]));

export function permissionLabel(bit: bigint): string {
  return LABEL_BY_BIT.get(bit) ?? `Unknown (${bit.toString()})`;
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
