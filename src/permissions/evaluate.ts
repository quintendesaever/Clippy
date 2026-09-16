import { PermissionFlagsBits } from "discord.js";
import {
  formatBitList,
  hasExplicit,
  HIGH_RISK_PERMISSIONS,
  listedBits,
  overwriteCompareMask,
  RELEVANT_PERMISSIONS,
} from "./flags.js";
import {
  CLIPPY_SERVER_POLICY,
  classifyRole,
  isHumanNonStaffRole,
  isMutedRoleName,
  namesSuggestCourseAccess,
  type ServerPolicy,
} from "./serverPolicy.js";
import type {
  AuditResult,
  ChannelSnapshot,
  Finding,
  GuildSnapshot,
  OverwriteSnapshot,
  RoleSnapshot,
} from "./types.js";

function roleById(guild: GuildSnapshot): Map<string, RoleSnapshot> {
  return new Map(guild.roles.map((role) => [role.id, role]));
}

function channelById(guild: GuildSnapshot): Map<string, ChannelSnapshot> {
  return new Map(guild.channels.map((channel) => [channel.id, channel]));
}

function everyoneRole(guild: GuildSnapshot): RoleSnapshot | undefined {
  return guild.roles.find((role) => role.id === guild.id);
}

function roleLabel(role: RoleSnapshot, guildId: string): string {
  if (role.id === guildId) return "@everyone";
  return `@${role.name}`;
}

function channelLabel(channel: ChannelSnapshot): string {
  return channel.kind === "category" ? `#${channel.name} (category)` : `#${channel.name}`;
}

function serializeRoleOverwriteMap(channel: ChannelSnapshot): string {
  const parts = channel.overwrites
    .filter((overwrite) => overwrite.type === "role")
    .map((overwrite) => {
      const allow = overwriteCompareMask(overwrite.allow);
      const deny = overwriteCompareMask(overwrite.deny);
      return { id: overwrite.id, allow, deny };
    })
    .filter((entry) => entry.allow !== 0n || entry.deny !== 0n)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((entry) => `${entry.id}:${entry.allow.toString()}:${entry.deny.toString()}`);
  return parts.join("|");
}

function everyoneOverwrite(channel: ChannelSnapshot, guildId: string): OverwriteSnapshot | undefined {
  return channel.overwrites.find((overwrite) => overwrite.type === "role" && overwrite.id === guildId);
}

function combinedEveryoneDeny(channel: ChannelSnapshot, parent: ChannelSnapshot | undefined, guildId: string): bigint {
  const own = everyoneOverwrite(channel, guildId);
  const parentOw = parent ? everyoneOverwrite(parent, guildId) : undefined;
  const ownDeny = own ? overwriteCompareMask(own.deny) : 0n;
  const ownAllow = own ? overwriteCompareMask(own.allow) : 0n;
  const parentDeny = parentOw ? overwriteCompareMask(parentOw.deny) : 0n;
  return ownDeny | (parentDeny & ~ownAllow);
}

function capList(names: string[], max = 8): string {
  if (names.length <= max) return names.join(", ");
  const shown = names.slice(0, max);
  return `${shown.join(", ")}, …and ${names.length - max} more`;
}

function push(findings: Finding[], finding: Finding): void {
  findings.push(finding);
}

export function evaluateAudit(
  guild: GuildSnapshot,
  policy: ServerPolicy = CLIPPY_SERVER_POLICY
): AuditResult {
  const findings: Finding[] = [];
  const roles = roleById(guild);
  const channels = channelById(guild);
  const everyone = everyoneRole(guild);

  if (everyone) {
    const granted = listedBits(everyone.permissions, HIGH_RISK_PERMISSIONS);
    if (granted.length > 0) {
      push(findings, {
        severity: "fail",
        code: "everyone_high_risk_base",
        title: "@everyone has high-risk base permissions",
        detail: `${roleLabel(everyone, guild.id)} explicitly has ${formatBitList(granted)}.`,
        target: everyone.id,
      });
    } else {
      push(findings, {
        severity: "ok",
        code: "everyone_base_clean",
        title: "@everyone has no high-risk base permissions",
        detail: "None of the high-risk bits are explicitly granted to @everyone.",
        target: everyone.id,
      });
    }
  }

  const everyoneOverwriteFails: string[] = [];
  for (const channel of guild.channels) {
    const overwrite = everyoneOverwrite(channel, guild.id);
    if (!overwrite) continue;
    const granted = listedBits(overwrite.allow, HIGH_RISK_PERMISSIONS);
    if (granted.length === 0) continue;
    everyoneOverwriteFails.push(`${channelLabel(channel)} allows ${formatBitList(granted)}`);
  }
  if (everyoneOverwriteFails.length > 0) {
    push(findings, {
      severity: "fail",
      code: "everyone_high_risk_overwrite",
      title: "@everyone is allowed high-risk permissions in a channel",
      detail: everyoneOverwriteFails.join("; ") + ".",
    });
  }

  for (const role of guild.roles) {
    if (!isHumanNonStaffRole(role, guild.id, policy)) continue;
    const granted = listedBits(role.permissions, HIGH_RISK_PERMISSIONS);
    if (granted.length === 0) continue;
    push(findings, {
      severity: "fail",
      code: "human_elevated",
      title: "Unmanaged role has high-risk permissions",
      detail: `${roleLabel(role, guild.id)} explicitly has ${formatBitList(granted)}.`,
      target: role.id,
    });
  }

  const humanOverwriteFails: string[] = [];
  for (const channel of guild.channels) {
    for (const overwrite of channel.overwrites) {
      if (overwrite.type !== "role" || overwrite.id === guild.id) continue;
      const role = roles.get(overwrite.id);
      if (!role || !isHumanNonStaffRole(role, guild.id, policy)) continue;
      const granted = listedBits(overwrite.allow, HIGH_RISK_PERMISSIONS);
      if (granted.length === 0) continue;
      humanOverwriteFails.push(
        `${roleLabel(role, guild.id)} is allowed ${formatBitList(granted)} in ${channelLabel(channel)}`
      );
    }
  }
  if (humanOverwriteFails.length > 0) {
    push(findings, {
      severity: "fail",
      code: "human_elevated_overwrite",
      title: "Unmanaged role is allowed high-risk channel permissions",
      detail: capList(humanOverwriteFails, 6) + ".",
    });
  }

  const pinMissing: string[] = [];
  const pinPresent: string[] = [];
  for (const roleId of policy.pinExpectedRoleIds) {
    const role = roles.get(roleId);
    if (!role) {
      pinMissing.push(`expected role \`${roleId}\` is missing`);
      continue;
    }
    if (hasExplicit(role.permissions, PermissionFlagsBits.PinMessages)) {
      pinPresent.push(roleLabel(role, guild.id));
    } else {
      pinMissing.push(`${roleLabel(role, guild.id)} (\`${role.id}\`)`);
    }
  }
  if (pinMissing.length > 0) {
    push(findings, {
      severity: "fail",
      code: "pin_missing",
      title: "Expected Pin Messages grant is missing",
      detail: pinMissing.join("; ") + ".",
    });
  } else if (pinPresent.length > 0) {
    push(findings, {
      severity: "ok",
      code: "pin_present",
      title: "Expected Pin Messages grants are present",
      detail: `${pinPresent.join(", ")} ${pinPresent.length === 1 ? "has" : "have"} Pin Messages.`,
    });
  }

  for (const role of guild.roles) {
    if (classifyRole(role, guild.id, policy) !== "managed") continue;
    const granted = listedBits(role.permissions, HIGH_RISK_PERMISSIONS);
    if (granted.length === 0) continue;
    push(findings, {
      severity: "warn",
      code: "managed_elevated",
      title: "Managed integration role has elevated permissions",
      detail: `${roleLabel(role, guild.id)} is managed and explicitly has ${formatBitList(granted)}. Review is informational, not a human-role failure.`,
      target: role.id,
    });
  }

  const memberOverwrites: string[] = [];
  for (const channel of guild.channels) {
    for (const overwrite of channel.overwrites) {
      if (overwrite.type !== "member") continue;
      const granted = listedBits(overwrite.allow, [...HIGH_RISK_PERMISSIONS, PermissionFlagsBits.ViewChannel]);
      if (granted.length === 0) continue;
      memberOverwrites.push(
        `member \`${overwrite.id}\` is allowed ${formatBitList(granted)} in ${channelLabel(channel)}`
      );
    }
  }
  if (memberOverwrites.length > 0) {
    push(findings, {
      severity: "warn",
      code: "member_overwrite",
      title: "Member-specific overwrite grants unexpected access",
      detail: capList(memberOverwrites, 6) + ".",
    });
  }

  const unsynced: string[] = [];
  for (const channel of guild.channels) {
    if (!channel.parentId) continue;
    const parent = channels.get(channel.parentId);
    if (channel.permissionsLocked === true) continue;
    if (channel.permissionsLocked === false) {
      unsynced.push(channelLabel(channel));
      continue;
    }
    if (parent && serializeRoleOverwriteMap(channel) !== serializeRoleOverwriteMap(parent)) {
      unsynced.push(channelLabel(channel));
    }
  }
  if (unsynced.length > 0) {
    push(findings, {
      severity: "warn",
      code: "unsynced_child",
      title: "Child channel is not permission-synced with its category",
      detail: `${unsynced.length} channel(s): ${capList(unsynced)}.`,
    });
  } else {
    const childCount = guild.channels.filter((channel) => channel.parentId).length;
    if (childCount > 0) {
      push(findings, {
        severity: "ok",
        code: "children_synced",
        title: "Child channels match their category overwrites",
        detail: `${childCount} child channel(s) are permission-synced or share the category's relevant role overwrites.`,
      });
    }
  }

  const childrenByParent = new Map<string, ChannelSnapshot[]>();
  for (const channel of guild.channels) {
    if (!channel.parentId || channel.kind === "category") continue;
    const list = childrenByParent.get(channel.parentId) ?? [];
    list.push(channel);
    childrenByParent.set(channel.parentId, list);
  }
  const consistentParents: string[] = [];
  const divergentParents: string[] = [];
  for (const [parentId, siblings] of childrenByParent) {
    if (siblings.length < 2) continue;
    const maps = new Set(siblings.map(serializeRoleOverwriteMap));
    const parent = channels.get(parentId);
    const parentName = parent ? channelLabel(parent) : `category ${parentId}`;
    if (maps.size === 1) {
      consistentParents.push(parentName);
    } else {
      divergentParents.push(
        `${parentName}: ${capList(siblings.map(channelLabel), 6)}`
      );
    }
  }
  if (divergentParents.length > 0) {
    push(findings, {
      severity: "warn",
      code: "sibling_divergence",
      title: "Sibling channels have different relevant role overwrites",
      detail: divergentParents.join("; ") + ".",
    });
  } else if (consistentParents.length > 0) {
    push(findings, {
      severity: "ok",
      code: "siblings_consistent",
      title: "Sibling channel overwrite maps are consistent",
      detail: `Relevant role overwrites match under ${capList(consistentParents)}.`,
    });
  }

  const byNormalizedName = new Map<string, RoleSnapshot[]>();
  for (const role of guild.roles) {
    if (role.id === guild.id) continue;
    if (classifyRole(role, guild.id, policy) === "decorative") continue;
    const key = role.name.trim().toLowerCase().replace(/\s+/g, " ");
    const list = byNormalizedName.get(key) ?? [];
    list.push(role);
    byNormalizedName.set(key, list);
  }
  const duplicateDiffs: string[] = [];
  for (const [name, group] of byNormalizedName) {
    if (group.length < 2) continue;
    const sets = new Set(
      group.map((role) => listedBits(role.permissions, RELEVANT_PERMISSIONS).map((bit) => bit.toString()).join(","))
    );
    if (sets.size <= 1) continue;
    duplicateDiffs.push(
      `${group.map((role) => `${roleLabel(role, guild.id)} (\`${role.id}\`)`).join(" vs ")} (normalized “${name}”)`
    );
  }
  if (duplicateDiffs.length > 0) {
    push(findings, {
      severity: "warn",
      code: "duplicate_role_name",
      title: "Duplicate role names have different relevant permissions",
      detail: duplicateDiffs.join("; ") + ".",
    });
  }

  const denyUndone: string[] = [];
  for (const channel of guild.channels) {
    const parent = channel.parentId ? channels.get(channel.parentId) : undefined;
    const everyoneDeny = combinedEveryoneDeny(channel, parent, guild.id);
    if (everyoneDeny === 0n) continue;
    for (const overwrite of channel.overwrites) {
      if (overwrite.type !== "role" || overwrite.id === guild.id) continue;
      const role = roles.get(overwrite.id);
      if (!role) continue;
      const kind = classifyRole(role, guild.id, policy);
      if (kind === "decorative") continue;
      const allowed = listedBits(overwrite.allow, [...HIGH_RISK_PERMISSIONS, PermissionFlagsBits.ViewChannel]);
      const undone = allowed.filter((bit) => hasExplicit(everyoneDeny, bit));
      if (undone.length === 0) continue;
      const onlyView =
        undone.length === 1 && undone[0] === PermissionFlagsBits.ViewChannel;
      if (onlyView) {
        if (kind === "staff") continue;
        if (isMutedRoleName(role.name, policy)) continue;
        const categoryName = parent?.name ?? (channel.kind === "category" ? channel.name : null);
        if (namesSuggestCourseAccess(role.name, channel.name, categoryName)) continue;
      }
      denyUndone.push(
        `${roleLabel(role, guild.id)} is allowed ${formatBitList(undone)} in ${channelLabel(channel)}`
      );
    }
  }
  if (denyUndone.length > 0) {
    push(findings, {
      severity: "warn",
      code: "deny_undone",
      title: "A role allow undoes an @everyone deny",
      detail: capList(denyUndone, 8) + ".",
    });
  }

  if (!guild.bot.resolved) {
    push(findings, {
      severity: "warn",
      code: "bot_member_unresolved",
      title: "Clippy could not resolve its own member",
      detail:
        "Inspection of roles and overwrites still works, but hierarchy/manageability notes are incomplete.",
    });
  } else if (guild.bot.highestRolePosition != null) {
    const above = guild.roles.filter((role) => {
      if (role.id === guild.id) return false;
      if (role.position < guild.bot.highestRolePosition!) return false;
      const kind = classifyRole(role, guild.id, policy);
      return kind === "staff" || kind === "human";
    });
    if (above.length > 0) {
      push(findings, {
        severity: "warn",
        code: "bot_hierarchy",
        title: "Some roles are above or equal to Clippy in the hierarchy",
        detail: `${above.length} role(s) cannot be managed in a future fix even though they can be inspected: ${capList(
          above.map((role) => roleLabel(role, guild.id))
        )}.`,
      });
    }
  }

  if (guild.rolesFetchIncomplete || guild.channelsFetchIncomplete) {
    const parts = [
      guild.rolesFetchIncomplete ? "roles" : null,
      guild.channelsFetchIncomplete ? "channels" : null,
    ].filter(Boolean);
    push(findings, {
      severity: "warn",
      code: "incomplete_fetch",
      title: "Report may be incomplete",
      detail: `Discord fetch failed for ${parts.join(" and ")}; used cached data where available.`,
    });
  }

  if (guild.bot.resolved) {
    push(findings, {
      severity: "ok",
      code: "inspection_ok",
      title: "Clippy can inspect this server",
      detail: "Clippy resolved its member and can read roles, channels, and effective permissions.",
    });
  }

  findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return { findings };
}

function severityRank(severity: Finding["severity"]): number {
  if (severity === "fail") return 0;
  if (severity === "warn") return 1;
  return 2;
}
