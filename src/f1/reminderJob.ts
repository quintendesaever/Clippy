import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { Client } from "discord.js";
import { getGuildId } from "../config.js";
import { getGuildTimezone } from "../stats/helpers.js";
import { getF1Timing, isF1TestMode } from "./config.js";
import { resolvePredictionUrl } from "./predictionUrl.js";
import { createDiscordPort } from "./discordPort.js";
import { buildReminderPayload, buildResultsPayload } from "./embeds.js";
import { withF1GuildLock } from "./lock.js";
import { replaceActiveF1Message } from "./messageLifecycle.js";
import { getF1ReminderSettings, upsertF1ReminderSettings } from "./reminderStorage.js";
import { fetchRaceWeekendResults, isPublishableResults } from "./results.js";
import { getActiveMeeting, usableQualifying, usableRace } from "./schedule.js";
import { buildStageSchedule, isResultsGiveUp, selectDueStage } from "./stages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENV_PATHS = [
  path.join(process.cwd(), ".env"),
  path.resolve(__dirname, "../../.env"),
];

let intervalHandle: NodeJS.Timeout | null = null;
const missingQualifyingLogged = new Set<string>();
const waitingResultsLogged = new Set<string>();
const giveUpLogged = new Set<string>();

function loadTestModeSentinel(): void {
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
}

export async function applyF1ReminderTick(client: Client, now: Date = new Date()): Promise<void> {
  const guildId = getGuildId();
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  await withF1GuildLock(guildId, async () => {
    const settings = await getF1ReminderSettings(guildId);
    if (!settings || !settings.enabled || !settings.channel_id || !settings.role_id) {
      return;
    }

    const timing = getF1Timing();
    const meeting = await getActiveMeeting(now, timing);
    if (!meeting) return;

    const schedule = buildStageSchedule(meeting, timing);
    if (schedule.missingQualifying && !missingQualifyingLogged.has(meeting.id)) {
      missingQualifyingLogged.add(meeting.id);
      console.error(
        `f1 reminder: no usable qualifying session for ${meeting.id} (${meeting.name}); cannot compute a prediction deadline. Skipping prediction reminders.`
      );
    }

    const qualifyingStartAt = usableQualifying(meeting)?.dateStart.toISOString() ?? null;
    const raceStartAt = usableRace(meeting)?.dateStart.toISOString() ?? null;
    if (
      settings.current_meeting_id === meeting.id &&
      (settings.qualifying_start_at !== qualifyingStartAt || settings.race_start_at !== raceStartAt)
    ) {
      await upsertF1ReminderSettings({
        guild_id: guildId,
        qualifying_start_at: qualifyingStartAt,
        race_start_at: raceStartAt,
      });
    }

    const due = selectDueStage(
      now,
      schedule,
      settings.last_stage_sent,
      settings.current_meeting_id
    );
    if (!due) return;

    const timezone = await getGuildTimezone(guildId);
    const discord = createDiscordPort(client);
    const persistTimes = {
      meetingId: meeting.id,
      qualifyingStartAt,
      raceStartAt,
    };

    if (due === "results") {
      const results = await fetchRaceWeekendResults(meeting);
      if (!isPublishableResults(results)) {
        if (!waitingResultsLogged.has(meeting.id)) {
          waitingResultsLogged.add(meeting.id);
          console.log(
            `f1 reminder: waiting for published race results and standings for ${meeting.id} (${meeting.name})`
          );
        }
        if (isResultsGiveUp(now, schedule) && !giveUpLogged.has(meeting.id)) {
          giveUpLogged.add(meeting.id);
          console.error(
            `f1 reminder: giving up on post-race results for ${meeting.id} (${meeting.name}); data was still unavailable after the retry window.`
          );
        }
        return;
      }

      const payload = buildResultsPayload({ meeting, results, timezone });
      const replaced = await replaceActiveF1Message({
        guildId,
        channelId: settings.channel_id,
        settings,
        payload,
        discord,
        storage: { upsert: upsertF1ReminderSettings },
        persist: { stage: "results", ...persistTimes },
      });
      if (!replaced.ok) {
        console.error(`f1 reminder: failed to publish results (${replaced.reason})`);
      }
      return;
    }

    const payload = buildReminderPayload({
      stage: due,
      meeting,
      schedule,
      timezone,
      roleId: settings.role_id,
      predictionUrl: resolvePredictionUrl(settings.prediction_url, process.env.F1_PREDICTION_URL),
      now,
    });
    const replaced = await replaceActiveF1Message({
      guildId,
      channelId: settings.channel_id,
      settings,
      payload,
      discord,
      storage: { upsert: upsertF1ReminderSettings },
      persist: { stage: due, ...persistTimes },
    });
    if (!replaced.ok) {
      console.error(`f1 reminder: failed to send ${due} (${replaced.reason})`);
    }
  });
}

export function startF1ReminderJob(client: Client): void {
  if (intervalHandle) return;

  loadTestModeSentinel();
  const timing = getF1Timing();
  console.log(
    `f1 reminder: job started (testMode=${isF1TestMode() ? "yes" : "no"}, intervalMs=${timing.jobIntervalMs})`
  );

  void applyF1ReminderTick(client).catch((err) =>
    console.error("f1 reminder: startup tick failed", err)
  );

  intervalHandle = setInterval(() => {
    void applyF1ReminderTick(client).catch((err) => console.error("f1 reminder: tick failed", err));
  }, timing.jobIntervalMs);
}
