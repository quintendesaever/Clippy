import { listedBits, permissionKey, permissionLabel, RELEVANT_PERMISSIONS } from "./flags.js";
import { classifyRole, roleKindLabel, CLIPPY_SERVER_POLICY, type ServerPolicy } from "./serverPolicy.js";
import type { MemberCatalogEntry, RoleEffectiveInspection } from "./snapshot.js";
import type {
  AuditResult,
  ChannelInspection,
  ChannelSnapshot,
  Finding,
  GuildSnapshot,
  OverwriteSource,
  ResolvedOverwrite,
  RoleInspection,
  RoleKind,
  UserInspection,
} from "./types.js";

export type PermissionFlagDto = {
  key: string;
  label: string;
  allowed?: boolean;
  granted?: boolean;
};

export type FindingDto = {
  code: string;
  severity: Finding["severity"];
  title: string;
  detail: string;
  target?: string;
};

export type RoleCatalogDto = {
  id: string;
  name: string;
  color?: string;
  position: number;
  managed: boolean;
  kind: RoleKind;
  kindLabel: string;
};

export type ChannelCatalogDto = {
  id: string;
  name: string;
  type: ChannelSnapshot["kind"];
  parentId: string | null;
  parentName?: string;
  permissionsLocked: boolean | null;
};

export type MemberCatalogDto = {
  id: string;
  displayName: string;
  username?: string;
};

export type PermissionsOverviewDto = {
  generatedAt: string;
  guild: { id: string; name: string };
  counts: { error: number; warning: number; expected: number };
  findings: FindingDto[];
  roles: RoleCatalogDto[];
  channels: ChannelCatalogDto[];
  members: MemberCatalogDto[];
  bot: {
    resolved: boolean;
    highestRoleName: string | null;
    highestRolePosition: number | null;
    limitations: string[];
  };
  incomplete: { roles: boolean; channels: boolean; members: boolean };
  writable: false;
};

export type RoleOverrideDto = {
  channelId: string;
  channelName: string;
  allow: string;
  deny: string;
  allowKeys: string[];
  denyKeys: string[];
};

export type RoleInspectionDto = {
  id: string;
  name: string;
  color?: string;
  position: number;
  managed: boolean;
  mentionable: boolean;
  kind: RoleKind;
  kindLabel: string;
  manageable: boolean | null;
  pinMessages: boolean;
  pinExpected: boolean;
  permissions: string;
  basePermissions: PermissionFlagDto[];
  highRiskGranted: string[];
  channelOverrides: RoleOverrideDto[];
  omittedOverrides: number;
  notes: string[];
};

export type ChannelOverwriteDto = {
  id: string;
  type: "role" | "member";
  name: string;
  everyone: boolean;
  member: boolean;
  source: OverwriteSource;
  allow: string;
  deny: string;
  allowKeys: string[];
  denyKeys: string[];
};

export type RoleEffectiveDto = {
  roleId: string;
  roleName: string;
  kind: RoleKind;
  computed: boolean;
  permissions: PermissionFlagDto[];
};

export type ChannelInspectionDto = {
  id: string;
  name: string;
  type: ChannelSnapshot["kind"];
  parentId: string | null;
  parentName: string | null;
  permissionsLocked: boolean | null;
  syncState: "synced" | "unsynced" | "category" | "none";
  overwrites: ChannelOverwriteDto[];
  bot: {
    resolved: boolean;
    canView: boolean | null;
    permissions: PermissionFlagDto[] | null;
  };
  roleEffective: RoleEffectiveDto[];
  notes: string[];
};

export type MemberInspectionDto = {
  userId: string;
  displayName: string;
  channelId: string;
  channelName: string;
  roles: { id: string; name: string }[];
  computed: boolean;
  owner: boolean;
  administrator: boolean;
  timedOut: boolean;
  timeoutUntil: string | null;
  permissions: PermissionFlagDto[];
  notes: string[];
};

function colorHex(color: number | undefined): string | undefined {
  if (color == null || color === 0) return undefined;
  return `#${color.toString(16).padStart(6, "0")}`;
}

function keysFromBits(field: bigint): string[] {
  return listedBits(field, RELEVANT_PERMISSIONS).map((bit) => permissionKey(bit));
}

function permissionFlags(
  entries: { bit: bigint; allowed?: boolean; granted?: boolean }[]
): PermissionFlagDto[] {
  return entries.map((entry) => ({
    key: permissionKey(entry.bit),
    label: permissionLabel(entry.bit),
    ...(entry.allowed != null ? { allowed: entry.allowed } : {}),
    ...(entry.granted != null ? { granted: entry.granted } : {}),
  }));
}

function findingDto(finding: Finding): FindingDto {
  return {
    code: finding.code,
    severity: finding.severity,
    title: finding.title,
    detail: finding.detail,
    ...(finding.target ? { target: finding.target } : {}),
  };
}

function countFindings(findings: Finding[]) {
  return {
    error: findings.filter((finding) => finding.severity === "fail").length,
    warning: findings.filter((finding) => finding.severity === "warn").length,
    expected: findings.filter((finding) => finding.severity === "ok").length,
  };
}

function botLimitations(snapshot: GuildSnapshot, result: AuditResult): string[] {
  const codes = new Set(["bot_member_unresolved", "bot_hierarchy", "incomplete_fetch"]);
  return result.findings.filter((finding) => codes.has(finding.code)).map((finding) => finding.detail);
}

function overwriteSource(channel: ChannelSnapshot, listedFromParent: boolean): OverwriteSource {
  if (listedFromParent) return "category";
  if (channel.kind === "category") return "base";
  if (channel.permissionsLocked === true) return "inherited";
  return "explicit";
}

function toOverwriteDto(
  overwrite: ResolvedOverwrite,
  source: OverwriteSource
): ChannelOverwriteDto {
  return {
    id: overwrite.id,
    type: overwrite.type,
    name: overwrite.name,
    everyone: overwrite.everyone,
    member: overwrite.member,
    source,
    allow: overwrite.allow.toString(),
    deny: overwrite.deny.toString(),
    allowKeys: keysFromBits(overwrite.allow),
    denyKeys: keysFromBits(overwrite.deny),
  };
}

function parentOverwrites(guild: GuildSnapshot, parentId: string | null): ResolvedOverwrite[] {
  if (!parentId) return [];
  const parent = guild.channels.find((channel) => channel.id === parentId);
  if (!parent) return [];
  return parent.overwrites.map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type,
    name:
      overwrite.type === "member"
        ? `member ${overwrite.id}`
        : overwrite.id === guild.id
          ? "@everyone"
          : (guild.roles.find((role) => role.id === overwrite.id)?.name ?? `unknown ${overwrite.id}`),
    allow: overwrite.allow,
    deny: overwrite.deny,
    everyone: overwrite.type === "role" && overwrite.id === guild.id,
    member: overwrite.type === "member",
  }));
}

function syncState(channel: ChannelSnapshot): ChannelInspectionDto["syncState"] {
  if (channel.kind === "category") return "category";
  if (!channel.parentId) return "none";
  if (channel.permissionsLocked === true) return "synced";
  return "unsynced";
}

export function toOverviewDto(
  snapshot: GuildSnapshot,
  result: AuditResult,
  members: MemberCatalogEntry[],
  membersFetchIncomplete: boolean,
  generatedAt = new Date().toISOString(),
  policy: ServerPolicy = CLIPPY_SERVER_POLICY
): PermissionsOverviewDto {
  const channelsById = new Map(snapshot.channels.map((channel) => [channel.id, channel]));
  return {
    generatedAt,
    guild: { id: snapshot.id, name: snapshot.name },
    counts: countFindings(result.findings),
    findings: result.findings.map(findingDto),
    roles: [...snapshot.roles]
      .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name))
      .map((role) => {
        const kind = classifyRole(role, snapshot.id, policy);
        return {
          id: role.id,
          name: role.id === snapshot.id ? "@everyone" : role.name,
          ...(colorHex(role.color) ? { color: colorHex(role.color) } : {}),
          position: role.position,
          managed: role.managed,
          kind,
          kindLabel: roleKindLabel(kind),
        };
      }),
    channels: [...snapshot.channels]
      .sort((a, b) => {
        if (a.kind === "category" && b.kind !== "category") return -1;
        if (a.kind !== "category" && b.kind === "category") return 1;
        return a.name.localeCompare(b.name);
      })
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.kind,
        parentId: channel.parentId,
        ...(channel.parentId
          ? { parentName: channelsById.get(channel.parentId)?.name }
          : {}),
        permissionsLocked: channel.permissionsLocked,
      })),
    members: members.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      ...(member.username ? { username: member.username } : {}),
    })),
    bot: {
      resolved: snapshot.bot.resolved,
      highestRoleName: snapshot.bot.highestRoleName ?? null,
      highestRolePosition: snapshot.bot.highestRolePosition,
      limitations: botLimitations(snapshot, result),
    },
    incomplete: {
      roles: snapshot.rolesFetchIncomplete,
      channels: snapshot.channelsFetchIncomplete,
      members: membersFetchIncomplete,
    },
    writable: false,
  };
}

export function toRoleInspectionDto(inspection: RoleInspection): RoleInspectionDto {
  return {
    id: inspection.role.id,
    name: inspection.role.name,
    ...(colorHex(inspection.role.color) ? { color: colorHex(inspection.role.color) } : {}),
    position: inspection.role.position,
    managed: inspection.role.managed,
    mentionable: inspection.role.mentionable,
    kind: inspection.kind,
    kindLabel: roleKindLabel(inspection.kind),
    manageable: inspection.manageable,
    pinMessages: inspection.pinMessages,
    pinExpected: inspection.pinExpected,
    permissions: inspection.role.permissions.toString(),
    basePermissions: permissionFlags(
      inspection.explicitPermissions.map((entry) => ({ bit: entry.bit, granted: entry.granted }))
    ),
    highRiskGranted: inspection.highRiskGranted.map((bit) => permissionKey(bit)),
    channelOverrides: inspection.channelOverrides.map((entry) => ({
      channelId: entry.channelId,
      channelName: entry.channelName,
      allow: entry.allow.toString(),
      deny: entry.deny.toString(),
      allowKeys: keysFromBits(entry.allow),
      denyKeys: keysFromBits(entry.deny),
    })),
    omittedOverrides: inspection.omittedOverrides,
    notes: inspection.notes,
  };
}

export function toChannelInspectionDto(
  guild: GuildSnapshot,
  inspection: ChannelInspection,
  roleEffective: RoleEffectiveInspection[] = []
): ChannelInspectionDto {
  const channel = inspection.channel;
  const own = inspection.overwrites.map((overwrite) =>
    toOverwriteDto(overwrite, overwriteSource(channel, false))
  );
  const parent = parentOverwrites(guild, channel.parentId)
    .filter((overwrite) => {
      const allow = keysFromBits(overwrite.allow);
      const deny = keysFromBits(overwrite.deny);
      return allow.length > 0 || deny.length > 0 || overwrite.everyone || overwrite.member;
    })
    .map((overwrite) => toOverwriteDto(overwrite, overwriteSource(channel, true)));

  return {
    id: channel.id,
    name: channel.name,
    type: channel.kind,
    parentId: channel.parentId,
    parentName: inspection.parentName,
    permissionsLocked: channel.permissionsLocked,
    syncState: syncState(channel),
    overwrites: [...own, ...parent],
    bot: {
      resolved: guild.bot.resolved,
      canView: inspection.botCanView,
      permissions: inspection.botEffective
        ? permissionFlags(inspection.botEffective.map((entry) => ({ bit: entry.bit, allowed: entry.allowed })))
        : null,
    },
    roleEffective: roleEffective.map((entry) => ({
      roleId: entry.roleId,
      roleName: entry.roleName,
      kind: entry.kind,
      computed: entry.computed,
      permissions: permissionFlags(entry.effective.map((item) => ({ bit: item.bit, allowed: item.allowed }))),
    })),
    notes: inspection.notes,
  };
}

export function toMemberInspectionDto(inspection: UserInspection): MemberInspectionDto {
  const notes = [...inspection.notes];
  if (inspection.owner) notes.unshift("This member is the server owner (owner short-circuit).");
  if (inspection.administrator) {
    notes.unshift("Administrator is granted, so Discord treats most channel permissions as allowed.");
  }
  if (inspection.timedOut) {
    notes.unshift(
      `This member is timed out${inspection.timeoutUntil ? ` until ${inspection.timeoutUntil}` : ""}. Timeout is separate from channel overwrites.`
    );
  }

  return {
    userId: inspection.userId,
    displayName: inspection.displayName,
    channelId: inspection.channelId,
    channelName: inspection.channelName,
    roles: inspection.roles,
    computed: inspection.computed,
    owner: inspection.owner,
    administrator: inspection.administrator,
    timedOut: inspection.timedOut,
    timeoutUntil: inspection.timeoutUntil,
    permissions: inspection.computed
      ? permissionFlags(inspection.effective.map((entry) => ({ bit: entry.bit, allowed: entry.allowed })))
      : [],
    notes,
  };
}

export function assertJsonSafe(value: unknown, path = "root"): void {
  if (typeof value === "bigint") {
    throw new Error(`bigint at ${path}`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonSafe(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      assertJsonSafe(child, `${path}.${key}`);
    }
  }
}
