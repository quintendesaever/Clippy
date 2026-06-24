import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { Client, TextChannel } from "discord.js";
import { getGuildId } from "../config.js";
import { findNextRace } from "./scheduleService.js";
import { buildF1ReminderEmbed } from "./reminderEmbed.js";
import { fetchWeather } from "./openf1.js";
import { getF1ReminderSettings, upsertF1ReminderSettings } from "./reminderStorage.js";
import { getGuildTimezone } from "../stats/helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENV_PATHS = [
  path.join(process.cwd(), ".env"),
  path.resolve(__dirname, "../../.env"),
];

function isTestMode(): boolean {
  const v = process.env.F1_REMINDER_TEST?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startF1ReminderJob(client: Client): void {
  if (intervalHandle) return;

  let envPathUsed: string | null = null;
  for (const envPath of ENV_PATHS) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: true });
      envPathUsed = envPath;
      break;
    }
  }

  const projectRoot = envPathUsed ? path.dirname(envPathUsed) : process.cwd();
  const sentinelPath = path.join(projectRoot, ".f1-reminder-test");
  if (fs.existsSync(sentinelPath)) {
    process.env.F1_REMINDER_TEST = "1";
  }

  const intervalMs = isTestMode() ? 30 * 1000 : 10 * 60 * 1000;
  console.log(
    `f1 reminder: job started (testMode=${isTestMode() ? "yes" : "no"}, intervalMs=${intervalMs})`
  );

  intervalHandle = setInterval(async () => {
    const now = new Date();
    const guildId = getGuildId();
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    try {
      const settings = await getF1ReminderSettings(guildId);
      if (!settings || !settings.enabled || !settings.channel_id || !settings.role_id) {
        return;
      }

      const nextRace = await findNextRace(now);
      if (!nextRace) return;

      const oneDayBeforeMs = isTestMode()
        ? nextRace.raceDate.getTime() - 2 * 60 * 1000
        : nextRace.raceDate.getTime() - 3 * 24 * 60 * 60 * 1000;
      const nowMs = now.getTime();

      if (nowMs < oneDayBeforeMs) return;
      if (nowMs > nextRace.raceDate.getTime()) return;
      if (settings.last_race_id_notified === nextRace.id) return;

      const channel = await guild.channels.fetch(settings.channel_id).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        return;
      }

      const serverTimezone = await getGuildTimezone(guildId);
      const weather =
        nextRace.meeting_key != null && nextRace.meeting_key > 0
          ? await fetchWeather(nextRace.meeting_key)
          : null;
      const embed = buildF1ReminderEmbed(nextRace, serverTimezone, weather);
      const roleMention = `<@&${settings.role_id}>`;

      await (channel as TextChannel).send({
        content: `${roleMention} F1 race weekend starts tomorrow!`,
        embeds: [embed],
      });

      await upsertF1ReminderSettings({
        guild_id: guildId,
        last_race_id_notified: nextRace.id,
      });
    } catch (err) {
      console.error(`f1 reminder: error for guild ${guildId}:`, err);
    }
  }, intervalMs);
}
