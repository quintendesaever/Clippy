import { PermissionFlagsBits } from "discord.js";
import { hasExplicit, HIGH_RISK_PERMISSIONS, listedBits, RELEVANT_PERMISSIONS } from "./flags.js";
import { CLIPPY_SERVER_POLICY, classifyRole, type ServerPolicy } from "./serverPolicy.js";
import type {
  ChannelInspection,
  ChannelOverrideSummary,
  GuildSnapshot,
  ResolvedOverwrite,
  RoleInspection,
} from "./types.js";

const MAX_ROLE_OVERRIDES = 12;

function roleName(guild: GuildSnapshot, id: string): string {
  if (id === guild.id) return "@everyone";
  return guild.roles.find((role) => role.id === id)?.name ?? `unknown ${id}`;
}

export function inspectRole(
  guild: GuildSnapshot,
  roleId: string,
  policy: ServerPolicy = CLIPPY_SERVER_POLICY
): RoleInspection | null {
  const role = guild.roles.find((entry) => entry.id === roleId);
  if (!role) return null;

  const kind = classifyRole(role, guild.id, policy);
  const highRiskGranted = listedBits(role.permissions, HIGH_RISK_PERMISSIONS);
  const pinExpected = (policy.pinExpectedRoleIds as readonly string[]).includes(role.id);
  const notes: string[] = [];

  if (!guild.bot.resolved) {
    notes.push("Clippy could not resolve its member, so manageability is unknown. Inspection of this role still works.");
  } else if (role.editable === false) {
    notes.push("Clippy cannot manage this role in a future write (hierarchy). Inspection is still possible.");
  }

  const overrides: ChannelOverrideSummary[] = [];
  for (const channel of guild.channels) {
    const overwrite = channel.overwrites.find((entry) => entry.type === "role" && entry.id === role.id);
    if (!overwrite) continue;
    const relevantAllow = listedBits(overwrite.allow, RELEVANT_PERMISSIONS);
    const relevantDeny = listedBits(overwrite.deny, RELEVANT_PERMISSIONS);
    if (relevantAllow.length === 0 && relevantDeny.length === 0) continue;
    overrides.push({
      channelId: channel.id,
      channelName: channel.name,
      allow: overwrite.allow,
      deny: overwrite.deny,
    });
  }
  overrides.sort((a, b) => a.channelName.localeCompare(b.channelName));
  const omittedOverrides = Math.max(0, overrides.length - MAX_ROLE_OVERRIDES);

  return {
    role,
    kind,
    explicitPermissions: RELEVANT_PERMISSIONS.map((bit) => ({
      bit,
      granted: hasExplicit(role.permissions, bit),
    })),
    highRiskGranted,
    pinMessages: hasExplicit(role.permissions, PermissionFlagsBits.PinMessages),
    pinExpected,
    manageable: role.editable,
    channelOverrides: overrides.slice(0, MAX_ROLE_OVERRIDES),
    omittedOverrides,
    notes,
  };
}

export function inspectChannel(guild: GuildSnapshot, channelId: string): ChannelInspection | null {
  const channel = guild.channels.find((entry) => entry.id === channelId);
  if (!channel) return null;

  const parent = channel.parentId ? guild.channels.find((entry) => entry.id === channel.parentId) : undefined;
  const overwrites: ResolvedOverwrite[] = channel.overwrites
    .filter((overwrite) => {
      const allow = listedBits(overwrite.allow, RELEVANT_PERMISSIONS);
      const deny = listedBits(overwrite.deny, RELEVANT_PERMISSIONS);
      return allow.length > 0 || deny.length > 0 || overwrite.id === guild.id || overwrite.type === "member";
    })
    .map((overwrite) => ({
      id: overwrite.id,
      type: overwrite.type,
      name: overwrite.type === "member" ? `member ${overwrite.id}` : roleName(guild, overwrite.id),
      allow: overwrite.allow,
      deny: overwrite.deny,
      everyone: overwrite.type === "role" && overwrite.id === guild.id,
      member: overwrite.type === "member",
    }))
    .sort((a, b) => {
      if (a.everyone !== b.everyone) return a.everyone ? -1 : 1;
      if (a.member !== b.member) return a.member ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const notes: string[] = [];
  if (channel.permissionsLocked === false) {
    notes.push("This channel is not permission-synced with its category.");
  }
  if (!guild.bot.resolved) {
    notes.push("Clippy could not resolve its member, so bot effective permissions are unknown.");
  }

  return {
    channel,
    parentName: parent?.name ?? null,
    overwrites,
    botEffective: null,
    botCanView: null,
    notes,
  };
}

export function withBotChannelPermissions(
  inspection: ChannelInspection,
  botEffective: { bit: bigint; allowed: boolean }[] | null,
  botCanView: boolean | null
): ChannelInspection {
  const notes = [...inspection.notes];
  if (botCanView === false) {
    notes.push("Clippy cannot view this channel. Cached overwrite facts are still shown.");
  }
  return { ...inspection, botEffective, botCanView, notes };
}
