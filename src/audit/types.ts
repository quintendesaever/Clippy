export const AUDIT_CATEGORIES = [
  "members",
  "roles",
  "channels",
  "bot_config",
  "command_errors",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export type AuditSeverity = "info" | "success" | "warn" | "error";

export type AuditActor = {
  id: string;
  tag?: string | null;
};

export type AuditField = {
  name: string;
  value: string;
  inline?: boolean;
};

export type AuditEvent = {
  guildId: string;
  category: AuditCategory;
  title: string;
  severity?: AuditSeverity;
  actor?: AuditActor | null;
  target?: string | null;
  details?: string | null;
  fields?: AuditField[];
};

export type AuditLogSettings = {
  guild_id: string;
  enabled: boolean;
  channel_id: string | null;
  log_members: boolean;
  log_roles: boolean;
  log_channels: boolean;
  log_bot_config: boolean;
  log_command_errors: boolean;
  created_at?: string;
  updated_at?: string;
};

export const CATEGORY_SETTING_KEY: Record<AuditCategory, keyof AuditLogSettings> = {
  members: "log_members",
  roles: "log_roles",
  channels: "log_channels",
  bot_config: "log_bot_config",
  command_errors: "log_command_errors",
};

export function emptyAuditLogSettings(guildId: string): AuditLogSettings {
  return {
    guild_id: guildId,
    enabled: false,
    channel_id: null,
    log_members: true,
    log_roles: true,
    log_channels: true,
    log_bot_config: true,
    log_command_errors: true,
  };
}

export function isAuditCategoryEnabled(
  settings: AuditLogSettings,
  category: AuditCategory
): boolean {
  if (!settings.enabled) return false;
  const key = CATEGORY_SETTING_KEY[category];
  return Boolean(settings[key]);
}
