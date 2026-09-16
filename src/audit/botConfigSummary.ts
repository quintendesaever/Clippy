import { formatMinutesAsHhmm } from "../library/time.js";

export type BotConfigSnapshot = {
  timezone: string;
  f1: {
    enabled: boolean;
    channelId: string | null;
    roleId: string | null;
    predictionUrl: string | null;
  };
  library: {
    enabled: boolean;
    channelId: string | null;
    openMinutes: number;
    closeMinutes: number;
  };
  logging: {
    enabled: boolean;
    channelId: string | null;
    logMembers: boolean;
    logRoles: boolean;
    logChannels: boolean;
    logBotConfig: boolean;
    logCommandErrors: boolean;
  };
};

function onOff(value: boolean): string {
  return value ? "on" : "off";
}

function channelRef(id: string | null): string {
  return id ? `<#${id}>` : "none";
}

function roleRef(id: string | null): string {
  return id ? `<@&${id}>` : "none";
}

export function summarizeBotSettingsChanges(
  before: BotConfigSnapshot,
  after: BotConfigSnapshot
): string[] {
  const details: string[] = [];
  if (before.timezone !== after.timezone) {
    details.push(`Timezone: ${before.timezone} → ${after.timezone}`);
  }
  if (before.f1.enabled !== after.f1.enabled) {
    details.push(`F1 reminders: ${onOff(before.f1.enabled)} → ${onOff(after.f1.enabled)}`);
  }
  if (before.f1.channelId !== after.f1.channelId) {
    details.push(`F1 channel: ${channelRef(before.f1.channelId)} → ${channelRef(after.f1.channelId)}`);
  }
  if (before.f1.roleId !== after.f1.roleId) {
    details.push(`F1 role: ${roleRef(before.f1.roleId)} → ${roleRef(after.f1.roleId)}`);
  }
  if (before.f1.predictionUrl !== after.f1.predictionUrl) {
    details.push(after.f1.predictionUrl ? "F1 prediction URL updated" : "F1 prediction URL cleared");
  }
  if (before.library.enabled !== after.library.enabled) {
    details.push(`Library: ${onOff(before.library.enabled)} → ${onOff(after.library.enabled)}`);
  }
  if (before.library.channelId !== after.library.channelId) {
    details.push(
      `Library channel: ${channelRef(before.library.channelId)} → ${channelRef(after.library.channelId)}`
    );
  }
  if (
    before.library.openMinutes !== after.library.openMinutes ||
    before.library.closeMinutes !== after.library.closeMinutes
  ) {
    details.push(
      `Library hours: ${formatMinutesAsHhmm(before.library.openMinutes)}–${formatMinutesAsHhmm(before.library.closeMinutes)} → ${formatMinutesAsHhmm(after.library.openMinutes)}–${formatMinutesAsHhmm(after.library.closeMinutes)}`
    );
  }
  if (before.logging.enabled !== after.logging.enabled) {
    details.push(`Audit logging: ${onOff(before.logging.enabled)} → ${onOff(after.logging.enabled)}`);
  }
  if (before.logging.channelId !== after.logging.channelId) {
    details.push(
      `Log channel: ${channelRef(before.logging.channelId)} → ${channelRef(after.logging.channelId)}`
    );
  }
  if (before.logging.logMembers !== after.logging.logMembers) {
    details.push(`Log members: ${onOff(before.logging.logMembers)} → ${onOff(after.logging.logMembers)}`);
  }
  if (before.logging.logRoles !== after.logging.logRoles) {
    details.push(`Log roles: ${onOff(before.logging.logRoles)} → ${onOff(after.logging.logRoles)}`);
  }
  if (before.logging.logChannels !== after.logging.logChannels) {
    details.push(
      `Log channels: ${onOff(before.logging.logChannels)} → ${onOff(after.logging.logChannels)}`
    );
  }
  if (before.logging.logBotConfig !== after.logging.logBotConfig) {
    details.push(
      `Log bot settings: ${onOff(before.logging.logBotConfig)} → ${onOff(after.logging.logBotConfig)}`
    );
  }
  if (before.logging.logCommandErrors !== after.logging.logCommandErrors) {
    details.push(
      `Log command errors: ${onOff(before.logging.logCommandErrors)} → ${onOff(after.logging.logCommandErrors)}`
    );
  }
  return details;
}
