import {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  type CategoryChannel,
  type Guild,
  type GuildBasedChannel,
  type GuildChannel,
  type Role,
  type ThreadChannel,
} from "discord.js";
import { RELEVANT_PERMISSIONS } from "./flags.js";
import { CLIPPY_SERVER_POLICY, classifyRole, type ServerPolicy } from "./serverPolicy.js";
import type {
  ChannelKind,
  ChannelSnapshot,
  GuildSnapshot,
  OverwriteSnapshot,
  RoleSnapshot,
  UserInspection,
} from "./types.js";

export const INSPECTABLE_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildCategory,
] as const;

export const THREAD_CHANNEL_TYPES = [
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
] as const;

export const UNSUPPORTED_CHANNEL_REPLY =
  "This inspector supports server text, announcement, and category channels. Threads are resolved to their parent.";

export const MAX_CHANNEL_ROLE_MATRIX = 24;

export type MemberCatalogEntry = {
  id: string;
  displayName: string;
  username: string | null;
};

export type InspectableChannelResult =
  | { ok: true; channel: GuildChannel | CategoryChannel }
  | { ok: false; message: string };

export function channelKind(type: ChannelType): ChannelKind | null {
  if (type === ChannelType.GuildText) return "text";
  if (type === ChannelType.GuildAnnouncement) return "announcement";
  if (type === ChannelType.GuildCategory) return "category";
  return null;
}

export function isThreadType(type: ChannelType): boolean {
  return (
    type === ChannelType.PublicThread ||
    type === ChannelType.PrivateThread ||
    type === ChannelType.AnnouncementThread
  );
}

function snapshotOverwrites(channel: GuildChannel | CategoryChannel): OverwriteSnapshot[] {
  return [...channel.permissionOverwrites.cache.values()].map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type === OverwriteType.Member ? "member" : "role",
    allow: overwrite.allow.bitfield,
    deny: overwrite.deny.bitfield,
  }));
}

export function snapshotChannel(channel: GuildChannel | CategoryChannel): ChannelSnapshot | null {
  const kind = channelKind(channel.type);
  if (!kind) return null;
  return {
    id: channel.id,
    name: channel.name,
    kind,
    parentId: channel.parentId,
    permissionsLocked: channel.permissionsLocked,
    overwrites: snapshotOverwrites(channel),
  };
}

export async function buildGuildSnapshot(guild: Guild): Promise<GuildSnapshot> {
  let rolesFetchIncomplete = false;
  let channelsFetchIncomplete = false;

  try {
    await guild.roles.fetch();
  } catch {
    rolesFetchIncomplete = true;
  }
  try {
    await guild.channels.fetch();
  } catch {
    channelsFetchIncomplete = true;
  }

  let me = guild.members.me ?? null;
  let resolved = true;
  if (!me) {
    try {
      me = await guild.members.fetchMe();
    } catch {
      resolved = false;
      me = null;
    }
  }

  const roles: RoleSnapshot[] = [...guild.roles.cache.values()].map((role) => ({
    id: role.id,
    name: role.name,
    position: role.position,
    permissions: role.permissions.bitfield,
    managed: role.managed,
    mentionable: role.mentionable,
    editable: resolved ? role.editable : null,
    color: role.color,
  }));

  const channels: ChannelSnapshot[] = [];
  for (const channel of guild.channels.cache.values()) {
    if (!("permissionOverwrites" in channel)) continue;
    const snapshot = snapshotChannel(channel as GuildChannel | CategoryChannel);
    if (snapshot) channels.push(snapshot);
  }

  return {
    id: guild.id,
    name: guild.name,
    roles,
    channels,
    bot: {
      memberId: me?.id ?? null,
      highestRolePosition: me?.roles.highest.position ?? null,
      highestRoleName: me?.roles.highest.name ?? null,
      resolved,
    },
    rolesFetchIncomplete,
    channelsFetchIncomplete,
  };
}

export async function loadMemberCatalog(guild: Guild): Promise<{
  members: MemberCatalogEntry[];
  membersFetchIncomplete: boolean;
}> {
  let membersFetchIncomplete = false;
  try {
    await guild.members.fetch();
  } catch {
    membersFetchIncomplete = true;
  }

  const members = [...guild.members.cache.values()]
    .filter((member) => !member.user.bot)
    .map((member) => ({
      id: member.id,
      displayName: member.displayName,
      username: member.user.username ?? null,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "nl"));

  return { members, membersFetchIncomplete };
}

async function resolveGuildChannel(guild: Guild, channelId: string): Promise<GuildBasedChannel | null> {
  const cached = guild.channels.cache.get(channelId);
  if (cached) return cached;
  return guild.channels.fetch(channelId).catch(() => null);
}

function threadParentId(channel: GuildBasedChannel): string | null {
  if ("parentId" in channel && isThreadType(channel.type)) {
    return (channel as ThreadChannel).parentId;
  }
  return null;
}

export async function resolveInspectableChannel(
  guild: Guild,
  channelId: string
): Promise<InspectableChannelResult> {
  const resolved = await resolveGuildChannel(guild, channelId);
  if (!resolved) {
    return { ok: false, message: "I could not find that channel in this server." };
  }
  if (isThreadType(resolved.type)) {
    const parentId = threadParentId(resolved);
    if (!parentId) {
      return {
        ok: false,
        message: "This thread has no parent channel with permission overwrites.",
      };
    }
    const parent = await resolveGuildChannel(guild, parentId);
    if (!parent) {
      return {
        ok: false,
        message: "This thread's parent channel is not available to inspect.",
      };
    }
    if (!channelKind(parent.type) || !("permissionOverwrites" in parent)) {
      return { ok: false, message: UNSUPPORTED_CHANNEL_REPLY };
    }
    return { ok: true, channel: parent as GuildChannel | CategoryChannel };
  }
  if (!channelKind(resolved.type) || !("permissionOverwrites" in resolved)) {
    return { ok: false, message: UNSUPPORTED_CHANNEL_REPLY };
  }
  return { ok: true, channel: resolved as GuildChannel | CategoryChannel };
}

export function botEffectiveOn(channel: GuildChannel | CategoryChannel, guild: Guild) {
  const me = guild.members.me;
  if (!me) return { botEffective: null, botCanView: null as boolean | null };
  const perms = channel.permissionsFor(me);
  if (!perms) return { botEffective: null, botCanView: null as boolean | null };
  return {
    botEffective: RELEVANT_PERMISSIONS.map((bit) => ({ bit, allowed: perms.has(bit) })),
    botCanView: perms.has(PermissionFlagsBits.ViewChannel),
  };
}

export async function inspectGuildMember(
  guild: Guild,
  userId: string,
  channel: GuildChannel | CategoryChannel
): Promise<UserInspection | { error: string }> {
  let member = guild.members.cache.get(userId);
  if (!member) {
    try {
      member = await guild.members.fetch(userId);
    } catch {
      return { error: "That user is not a member of this server, or I could not fetch them." };
    }
  }

  const perms = channel.permissionsFor(member);
  const notes: string[] = [];
  const roles = [...member.roles.cache.values()]
    .filter((role) => role.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => ({ id: role.id, name: role.name }));

  return {
    userId: member.id,
    displayName: member.displayName,
    channelId: channel.id,
    channelName: channel.name,
    roles,
    effective: perms ? RELEVANT_PERMISSIONS.map((bit) => ({ bit, allowed: perms.has(bit) })) : [],
    administrator: member.permissions.has(PermissionFlagsBits.Administrator),
    owner: member.id === guild.ownerId,
    timedOut: member.isCommunicationDisabled(),
    timeoutUntil: member.communicationDisabledUntil?.toISOString() ?? null,
    computed: Boolean(perms),
    notes,
  };
}

function relevantOverwriteRoleIds(snapshot: GuildSnapshot, channelId: string): Set<string> {
  const ids = new Set<string>([snapshot.id]);
  const channel = snapshot.channels.find((entry) => entry.id === channelId);
  if (!channel) return ids;
  for (const overwrite of channel.overwrites) {
    if (overwrite.type === "role") ids.add(overwrite.id);
  }
  if (channel.parentId) {
    const parent = snapshot.channels.find((entry) => entry.id === channel.parentId);
    for (const overwrite of parent?.overwrites ?? []) {
      if (overwrite.type === "role") ids.add(overwrite.id);
    }
  }
  return ids;
}

export type RoleEffectiveInspection = {
  roleId: string;
  roleName: string;
  kind: ReturnType<typeof classifyRole>;
  computed: boolean;
  effective: { bit: bigint; allowed: boolean }[];
};

export function inspectRoleEffectiveInChannel(
  guild: Guild,
  snapshot: GuildSnapshot,
  channel: GuildChannel | CategoryChannel,
  policy: ServerPolicy = CLIPPY_SERVER_POLICY
): RoleEffectiveInspection[] {
  const wanted = relevantOverwriteRoleIds(snapshot, channel.id);
  const candidates = [...guild.roles.cache.values()]
    .filter((role) => {
      if (wanted.has(role.id)) return true;
      const snap = snapshot.roles.find((entry) => entry.id === role.id);
      if (!snap) return false;
      return classifyRole(snap, snapshot.id, policy) === "staff";
    })
    .sort((a, b) => b.position - a.position)
    .slice(0, MAX_CHANNEL_ROLE_MATRIX);

  return candidates.map((role) => toRoleEffective(channel, role, snapshot, policy));
}

function toRoleEffective(
  channel: GuildChannel | CategoryChannel,
  role: Role,
  snapshot: GuildSnapshot,
  policy: ServerPolicy
): RoleEffectiveInspection {
  const snap = snapshot.roles.find((entry) => entry.id === role.id);
  const perms = channel.permissionsFor(role);
  return {
    roleId: role.id,
    roleName: role.id === snapshot.id ? "@everyone" : role.name,
    kind: snap ? classifyRole(snap, snapshot.id, policy) : "human",
    computed: Boolean(perms),
    effective: perms ? RELEVANT_PERMISSIONS.map((bit) => ({ bit, allowed: perms.has(bit) })) : [],
  };
}
