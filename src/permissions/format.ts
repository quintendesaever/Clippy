import { EmbedBuilder } from "discord.js";
import { formatBitList, listedBits, permissionLabel, RELEVANT_PERMISSIONS } from "./flags.js";
import type {
  AuditResult,
  ChannelInspection,
  Finding,
  FindingSeverity,
  RoleInspection,
  UserInspection,
} from "./types.js";

export const PERMISSION_COLORS = {
  fail: 0xef4444,
  warn: 0xf59e0b,
  ok: 0x22c55e,
  info: 0x3b82f6,
} as const;

export const DISCORD_EMBED_TITLE_LIMIT = 256;
export const DISCORD_EMBED_DESCRIPTION_LIMIT = 4096;
export const DISCORD_EMBED_FIELD_NAME_LIMIT = 256;
export const DISCORD_EMBED_FIELD_VALUE_LIMIT = 1024;
export const DISCORD_MAX_EMBEDS = 10;
export const DISCORD_MAX_FIELDS = 25;

const STATUS_MARK: Record<FindingSeverity, string> = {
  fail: "❌",
  warn: "⚠️",
  ok: "✅",
};

const STATUS_LABEL: Record<FindingSeverity, string> = {
  fail: "Incorrect",
  warn: "Check",
  ok: "Expected",
};

export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return "…";
  return `${text.slice(0, max - 1)}…`;
}

export function clipFieldValue(text: string): string {
  return truncateText(text, DISCORD_EMBED_FIELD_VALUE_LIMIT);
}

export function clipDescription(text: string): string {
  return truncateText(text, DISCORD_EMBED_DESCRIPTION_LIMIT);
}

export function clipTitle(text: string): string {
  return truncateText(text, DISCORD_EMBED_TITLE_LIMIT);
}

function findingLine(finding: Finding): string {
  return `${STATUS_MARK[finding.severity]} **${finding.title}**\n${finding.detail}`;
}

function packLines(lines: string[], limit: number): { text: string; used: number; omitted: number } {
  if (lines.length === 0) return { text: "", used: 0, omitted: 0 };
  const parts: string[] = [];
  let used = 0;
  for (let i = 0; i < lines.length; i++) {
    const next = parts.length === 0 ? lines[i]! : `${parts.join("\n\n")}\n\n${lines[i]}`;
    const remaining = lines.length - i - 1;
    const suffix = remaining > 0 ? `\n\n…and ${remaining} more` : "";
    if (next.length + suffix.length > limit && parts.length > 0) {
      const omitted = lines.length - i;
      return { text: `${parts.join("\n\n")}\n\n…and ${omitted} more`, used: parts.length, omitted };
    }
    parts.push(lines[i]!);
    used += 1;
  }
  return { text: parts.join("\n\n"), used, omitted: 0 };
}

export function formatAuditEmbeds(guildName: string, guildId: string, result: AuditResult): EmbedBuilder[] {
  const findings = result.findings;
  const failCount = findings.filter((finding) => finding.severity === "fail").length;
  const warnCount = findings.filter((finding) => finding.severity === "warn").length;
  const okCount = findings.filter((finding) => finding.severity === "ok").length;

  const summaryColor =
    failCount > 0 ? PERMISSION_COLORS.fail : warnCount > 0 ? PERMISSION_COLORS.warn : PERMISSION_COLORS.ok;

  const summary = new EmbedBuilder()
    .setTitle(clipTitle("Permission audit"))
    .setColor(summaryColor)
    .setDescription(
      clipDescription(
        [
          `**${failCount}** ❌ Incorrect · **${warnCount}** ⚠️ Check · **${okCount}** ✅ Expected`,
          `Server: **${guildName}** (\`${guildId}\`)`,
          "Read-only report. Clippy does not change permissions.",
        ].join("\n")
      )
    );

  const embeds: EmbedBuilder[] = [summary];
  let omitted = 0;

  for (const severity of ["fail", "warn", "ok"] as const) {
    const group = findings.filter((finding) => finding.severity === severity);
    if (group.length === 0) continue;
    if (embeds.length >= DISCORD_MAX_EMBEDS) {
      omitted += group.length;
      continue;
    }
    const packed = packLines(group.map(findingLine), DISCORD_EMBED_DESCRIPTION_LIMIT);
    omitted += packed.omitted;
    embeds.push(
      new EmbedBuilder()
        .setTitle(clipTitle(`${STATUS_MARK[severity]} ${STATUS_LABEL[severity]}`))
        .setColor(PERMISSION_COLORS[severity])
        .setDescription(clipDescription(packed.text || "None"))
    );
  }

  if (omitted > 0) {
    summary.addFields({ name: "Omitted", value: clipFieldValue(`…and ${omitted} more`) });
  }

  return embeds.slice(0, DISCORD_MAX_EMBEDS);
}

function kindLabel(kind: RoleInspection["kind"]): string {
  switch (kind) {
    case "everyone":
      return "@everyone";
    case "staff":
      return "staff";
    case "managed":
      return "managed integration/bot";
    case "decorative":
      return "decorative";
    default:
      return "human (unmanaged, non-staff)";
  }
}

function highRiskStatus(inspection: RoleInspection): string {
  if (inspection.highRiskGranted.length === 0) return "✅ no high-risk bits explicitly granted";
  if (inspection.kind === "staff") {
    return `✅ staff role with ${formatBitList(inspection.highRiskGranted)}`;
  }
  if (inspection.kind === "managed") {
    return `⚠️ managed role with ${formatBitList(inspection.highRiskGranted)}`;
  }
  if (inspection.kind === "everyone" || inspection.kind === "human") {
    return `❌ ${formatBitList(inspection.highRiskGranted)}`;
  }
  return formatBitList(inspection.highRiskGranted);
}

export function formatRoleEmbeds(inspection: RoleInspection): EmbedBuilder[] {
  const granted = inspection.explicitPermissions.filter((entry) => entry.granted);
  const permLines =
    granted.length === 0
      ? "None of the relevant bits are explicitly granted."
      : granted.map((entry) => `• ${permissionLabel(entry.bit)}`).join("\n");

  const manageability =
    inspection.manageable == null
      ? "unknown — Clippy could not resolve its member (inspection still works)"
      : inspection.manageable
        ? "yes — Clippy could edit this role in a future write"
        : "no — hierarchy prevents Clippy from editing this role (inspection still works)";

  const pin = inspection.pinMessages
    ? inspection.pinExpected
      ? "✅ granted (expected by server policy)"
      : "✅ granted"
    : inspection.pinExpected
      ? "❌ missing (expected by server policy)"
      : "not granted";

  const embed = new EmbedBuilder()
    .setTitle(clipTitle(`Role ${inspection.role.name}`))
    .setColor(
      inspection.highRiskGranted.length > 0 && (inspection.kind === "human" || inspection.kind === "everyone")
        ? PERMISSION_COLORS.fail
        : PERMISSION_COLORS.info
    )
    .addFields(
      {
        name: "Identity",
        value: clipFieldValue(
          [
            `Name: **${inspection.role.name}**`,
            `ID: \`${inspection.role.id}\``,
            `Managed: ${inspection.role.managed ? "yes" : "no"}`,
            `Mentionable: ${inspection.role.mentionable ? "yes" : "no"}`,
            `Hierarchy position: ${inspection.role.position}`,
            `Classification: ${kindLabel(inspection.kind)}`,
          ].join("\n")
        ),
      },
      {
        name: "Relevant base permissions (explicit)",
        value: clipFieldValue(permLines),
      },
      {
        name: "High-risk status",
        value: clipFieldValue(highRiskStatus(inspection)),
      },
      {
        name: "Pin Messages",
        value: clipFieldValue(pin),
      },
      {
        name: "Manageability (not inspectability)",
        value: clipFieldValue(manageability),
      }
    );

  if (inspection.channelOverrides.length > 0) {
    const lines = inspection.channelOverrides.map((entry) => {
      const allow = formatBitList(listedBits(entry.allow, RELEVANT_PERMISSIONS));
      const deny = formatBitList(listedBits(entry.deny, RELEVANT_PERMISSIONS));
      return `• #${entry.channelName}: allow ${allow}; deny ${deny}`;
    });
    const omitted =
      inspection.omittedOverrides > 0 ? `\n…and ${inspection.omittedOverrides} more` : "";
    embed.addFields({
      name: "Relevant channel overrides",
      value: clipFieldValue(`${lines.join("\n")}${omitted}`),
    });
  }

  if (inspection.notes.length > 0) {
    embed.addFields({ name: "Notes", value: clipFieldValue(inspection.notes.join("\n")) });
  }

  return [embed];
}

export function formatChannelEmbeds(inspection: ChannelInspection): EmbedBuilder[] {
  const locked =
    inspection.channel.permissionsLocked == null
      ? "n/a"
      : inspection.channel.permissionsLocked
        ? "yes (synced with category)"
        : "no (not synced)";

  const overwriteLines =
    inspection.overwrites.length === 0
      ? "No relevant overwrites."
      : inspection.overwrites.map((overwrite) => {
          const allow = formatBitList(listedBits(overwrite.allow, RELEVANT_PERMISSIONS));
          const deny = formatBitList(listedBits(overwrite.deny, RELEVANT_PERMISSIONS));
          const tags = [
            overwrite.everyone ? "@everyone" : null,
            overwrite.member ? "member-specific" : null,
          ].filter(Boolean);
          const tagText = tags.length ? ` (${tags.join(", ")})` : "";
          const label = overwrite.member ? `member \`${overwrite.id}\`` : overwrite.everyone ? "@everyone" : `@${overwrite.name}`;
          return `• ${label}${tagText}: allow ${allow}; deny ${deny}`;
        });

  const packed = packLines(
    Array.isArray(overwriteLines) ? overwriteLines : [overwriteLines],
    DISCORD_EMBED_FIELD_VALUE_LIMIT
  );

  const embed = new EmbedBuilder()
    .setTitle(clipTitle(`${inspection.channel.kind === "category" ? "Category" : "Channel"} ${inspection.channel.name}`))
    .setColor(PERMISSION_COLORS.info)
    .addFields(
      {
        name: "Identity",
        value: clipFieldValue(
          [
            `Name: **${inspection.channel.name}**`,
            `ID: \`${inspection.channel.id}\``,
            `Type: ${inspection.channel.kind}`,
            `Parent: ${inspection.parentName ? `#${inspection.parentName}` : "none"}`,
            `permissionsLocked: ${locked}`,
          ].join("\n")
        ),
      },
      {
        name: "Relevant overwrites",
        value: clipFieldValue(packed.text || "No relevant overwrites."),
      }
    );

  if (inspection.botEffective) {
    const lines = inspection.botEffective.map(
      (entry) => `${entry.allowed ? "✅" : "❌"} ${permissionLabel(entry.bit)}`
    );
    embed.addFields({
      name: "Clippy effective permissions",
      value: clipFieldValue(lines.join("\n")),
    });
  }

  if (inspection.notes.length > 0) {
    embed.addFields({ name: "Notes", value: clipFieldValue(inspection.notes.join("\n")) });
  }

  return [embed];
}

export function formatUserEmbeds(inspection: UserInspection): EmbedBuilder[] {
  const color = inspection.computed ? PERMISSION_COLORS.info : PERMISSION_COLORS.warn;
  const embed = new EmbedBuilder()
    .setTitle(clipTitle(`User ${inspection.displayName}`))
    .setColor(color)
    .addFields({
      name: "Identity",
      value: clipFieldValue(
        [
          `Member: **${inspection.displayName}** (<@${inspection.userId}>)`,
          `Channel: **#${inspection.channelName}** (\`${inspection.channelId}\`)`,
        ].join("\n")
      ),
    });

  if (inspection.computed) {
    const lines = inspection.effective.map(
      (entry) => `${entry.allowed ? "✅" : "❌"} ${permissionLabel(entry.bit)}`
    );
    embed.addFields({
      name: "Effective permissions in this channel",
      value: clipFieldValue(lines.join("\n") || "None computed."),
    });
  } else {
    embed.addFields({
      name: "Effective permissions in this channel",
      value: "Could not compute effective permissions for this member in that channel.",
    });
  }

  const roleLines =
    inspection.roles.length === 0
      ? "No roles besides @everyone."
      : inspection.roles.map((role) => `• @${role.name} (\`${role.id}\`)`).join("\n");
  const packedRoles = packLines(roleLines.split("\n"), DISCORD_EMBED_FIELD_VALUE_LIMIT);
  embed.addFields({ name: "Roles", value: clipFieldValue(packedRoles.text) });

  const notes = [...inspection.notes];
  if (inspection.owner) notes.unshift("This member is the server owner (owner short-circuit).");
  if (inspection.administrator) notes.unshift("Administrator is granted, so Discord treats most channel permissions as allowed.");
  if (inspection.timedOut) {
    notes.unshift(
      `This member is timed out${inspection.timeoutUntil ? ` until ${inspection.timeoutUntil}` : ""}. Timeout is separate from channel overwrites.`
    );
  }
  if (notes.length > 0) {
    embed.addFields({ name: "Notes", value: clipFieldValue(notes.join("\n")) });
  }

  return [embed];
}

export function assertEmbedsWithinDiscordLimits(embeds: EmbedBuilder[]): void {
  if (embeds.length > DISCORD_MAX_EMBEDS) {
    throw new Error(`Too many embeds: ${embeds.length}`);
  }
  for (const embed of embeds) {
    const json = embed.toJSON();
    if ((json.title?.length ?? 0) > DISCORD_EMBED_TITLE_LIMIT) {
      throw new Error("embed title exceeds Discord limit");
    }
    if ((json.description?.length ?? 0) > DISCORD_EMBED_DESCRIPTION_LIMIT) {
      throw new Error("embed description exceeds Discord limit");
    }
    if ((json.fields?.length ?? 0) > DISCORD_MAX_FIELDS) {
      throw new Error("embed has too many fields");
    }
    for (const field of json.fields ?? []) {
      if (field.name.length > DISCORD_EMBED_FIELD_NAME_LIMIT) {
        throw new Error("field name exceeds Discord limit");
      }
      if (field.value.length > DISCORD_EMBED_FIELD_VALUE_LIMIT) {
        throw new Error("field value exceeds Discord limit");
      }
    }
  }
}
