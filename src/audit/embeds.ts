import { EmbedBuilder } from "discord.js";
import type { AuditEvent, AuditSeverity } from "./types.js";

export const AUDIT_COLORS: Record<AuditSeverity, number> = {
  info: 0x3b82f6,
  success: 0x22c55e,
  warn: 0xf59e0b,
  error: 0xef4444,
};

const AUDIT_FOOTER = "Clippy audit";
const DEFAULT_MAX_TEXT = 400;

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+\S+/gi,
  /(?:token|secret|password|api[_-]?key|session_secret)\s*[:=]\s*\S+/gi,
  /postgres(?:ql)?:\/\/\S+/gi,
  /https?:\/\/[^/\s]+:[^/\s]+@\S*/gi,
];

export function sanitizeAuditText(input: string, max = DEFAULT_MAX_TEXT): string {
  let text = input.replace(/\r/g, "").trim();
  if (/\n\s*at\s+/.test(text)) {
    text = text.split("\n")[0] ?? "";
  }
  const lines = text.split("\n").slice(0, 4);
  text = lines.join("\n").trim();
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[redacted]");
  }
  if (text.length > max) {
    return `${text.slice(0, max - 1)}…`;
  }
  return text;
}

function actorValue(event: AuditEvent): string | null {
  if (!event.actor?.id) return null;
  const tag = event.actor.tag?.trim();
  return tag ? `<@${event.actor.id}> (${tag}, ${event.actor.id})` : `<@${event.actor.id}> (${event.actor.id})`;
}

export function buildAuditEmbed(event: AuditEvent): EmbedBuilder {
  const severity = event.severity ?? "info";
  const embed = new EmbedBuilder()
    .setTitle(sanitizeAuditText(event.title, 256))
    .setColor(AUDIT_COLORS[severity])
    .setTimestamp(new Date())
    .setFooter({ text: AUDIT_FOOTER });

  const actor = actorValue(event);
  if (actor) {
    embed.addFields({ name: "Member", value: sanitizeAuditText(actor, 1024), inline: true });
  }
  if (event.target) {
    embed.addFields({
      name: "Target",
      value: sanitizeAuditText(event.target, 1024),
      inline: true,
    });
  }
  if (event.details) {
    embed.addFields({
      name: "Details",
      value: sanitizeAuditText(event.details, 1024),
      inline: false,
    });
  }
  for (const field of event.fields ?? []) {
    embed.addFields({
      name: sanitizeAuditText(field.name, 256),
      value: sanitizeAuditText(field.value, 1024),
      inline: field.inline ?? false,
    });
  }

  return embed;
}
