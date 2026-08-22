import "dotenv/config";
import { REST, Routes } from "discord.js";
import { getGuildId } from "../src/config.js";
import { F1_STATS_PREVIEW_CUSTOM_ID } from "../src/f1/config.js";
import { createRestDiscordPort } from "../src/f1/discordPort.js";
import { buildExtraStatsEmbed } from "../src/f1/embeds.js";
import { buildPreviewRaceResults } from "../src/f1/previewResults.js";
import { resolvePredictionUrl } from "../src/f1/predictionUrl.js";
import { getF1ReminderSettings } from "../src/f1/reminderStorage.js";
import { F1_TEST_STAGES, resolveMeetingForPreview, sendF1TestPreview } from "../src/f1/testPreview.js";

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
  console.error("Missing DISCORD_TOKEN");
  process.exit(1);
}

const guildId = getGuildId();
const rest = new REST({ version: "10" }).setToken(token);
const discord = createRestDiscordPort(rest);

async function fetchMessage(channelId: string, messageId: string) {
  return (await rest.get(Routes.channelMessage(channelId, messageId))) as {
    id: string;
    content: string;
    embeds: {
      title?: string;
      description?: string;
      footer?: { text?: string };
      fields?: { name?: string; value?: string }[];
    }[];
    components: { components?: { custom_id?: string; url?: string; label?: string }[] }[];
    mentions?: { roles?: string[] };
  };
}

const settingsBefore = await getF1ReminderSettings(guildId);
if (!settingsBefore?.channel_id || !settingsBefore.role_id) {
  console.error("F1 channel/role not configured");
  process.exit(1);
}

const scheduleBefore = {
  last_stage_sent: settingsBefore.last_stage_sent,
  current_meeting_id: settingsBefore.current_meeting_id,
};
const roleId = settingsBefore.role_id;
const predictionUrl = resolvePredictionUrl(settingsBefore.prediction_url, process.env.F1_PREDICTION_URL);
let previousMessageId = settingsBefore.active_message_id;

const clientId = process.env.CLIENT_ID?.trim();
if (clientId) {
  const commands = (await rest.get(Routes.applicationGuildCommands(clientId, guildId))) as {
    name: string;
    options?: { name: string; options?: { name: string; choices?: { value: string }[] }[] }[];
  }[];
  const f1 = commands.find((command) => command.name === "f1-reminder");
  const subs = (f1?.options ?? []).map((option) => option.name);
  const stages = f1?.options
    ?.find((option) => option.name === "test-send")
    ?.options?.find((option) => option.name === "stage")
    ?.choices?.map((choice) => choice.value);
  console.log(`Registered commands: ${commands.map((command) => command.name).join(", ")}`);
  console.log(`f1-reminder subcommands: ${subs.join(", ") || "(missing)"}`);
  console.log(`test-send stages: ${stages?.join(", ") || "(missing)"}`);
  for (const required of ["status", "test-send", "test-schedule", "set-prediction-url"]) {
    if (!subs.includes(required)) {
      console.error(`FAIL slash command missing subcommand ${required}`);
      process.exit(1);
    }
  }
}

console.log(`Smoke test guild=${guildId} channel=${settingsBefore.channel_id}`);
console.log(`Schedule before: last_stage_sent=${scheduleBefore.last_stage_sent} meeting=${scheduleBefore.current_meeting_id}`);

for (const stage of F1_TEST_STAGES) {
  const result = await sendF1TestPreview({ guildId, stage, discord });
  if (!result.ok) {
    console.error(`FAIL ${stage}: ${result.reason}`);
    process.exit(1);
  }
  const message = await fetchMessage(settingsBefore.channel_id, result.messageId);
  const content = message.content ?? "";
  const title = message.embeds[0]?.title ?? "";
  const description = message.embeds[0]?.description ?? "";
  const footer = message.embeds[0]?.footer?.text ?? "";
  const fields = message.embeds[0]?.fields ?? [];
  const fieldBlob = fields.map((field) => `${field.name}: ${field.value}`).join("\n");
  const buttons = message.components.flatMap((row) => row.components ?? []);
  console.log(`  title=${title}`);
  console.log(`  footer=${footer}`);
  console.log(`  description=${description}`);
  for (const field of fields) {
    console.log(`  field ${field.name}=${(field.value ?? "").replace(/\n/g, " | ")}`);
  }
  console.log(`  buttons=${buttons.map((button) => button.label ?? button.custom_id ?? button.url).join(",") || "(none)"}`);

  if (previousMessageId && previousMessageId !== result.messageId) {
    try {
      await rest.get(Routes.channelMessage(settingsBefore.channel_id, previousMessageId));
      console.error(`FAIL ${stage}: previous message ${previousMessageId} still exists`);
      process.exit(1);
    } catch {
      console.log(`OK ${stage}: previous message ${previousMessageId} deleted`);
    }
  }

  if (stage === "results") {
    if (content.includes(`<@&${roleId}>`)) {
      console.error(`FAIL results: role mention present`);
      process.exit(1);
    }
    if (!/TEST results preview/i.test(title) && !/TEST PREVIEW/i.test(footer)) {
      console.error(`FAIL results: missing TEST preview labeling`);
      process.exit(1);
    }
    if (!buttons.some((button) => button.custom_id === F1_STATS_PREVIEW_CUSTOM_ID)) {
      console.error(`FAIL results: missing preview stats button`);
      process.exit(1);
    }
    if (!/Lando Norris/i.test(fieldBlob) || !/Race result/i.test(fieldBlob)) {
      console.error("FAIL results: missing top-5 classification");
      process.exit(1);
    }
    if (!/Fastest lap/i.test(fieldBlob) || !/Biggest gain/i.test(fieldBlob) || !/DNF/i.test(fieldBlob)) {
      console.error("FAIL results: missing race notes");
      process.exit(1);
    }
    if (!/Drivers championship/i.test(fieldBlob) || !/Constructors championship/i.test(fieldBlob)) {
      console.error("FAIL results: missing standings");
      process.exit(1);
    }
    console.log(`OK results: no role mention, preview stats button, message ${result.messageId}`);
  } else {
    if (!content.includes(`<@&${roleId}>`)) {
      console.error(`FAIL ${stage}: missing role mention`);
      process.exit(1);
    }
    if (!/\(test\)/i.test(content)) {
      console.error(`FAIL ${stage}: missing test prefix`);
      process.exit(1);
    }
    if (!/Times in /i.test(footer)) {
      console.error(`FAIL ${stage}: missing timezone footer`);
      process.exit(1);
    }
    if (!/Prediction deadline/i.test(fieldBlob) || !/Qualifying/i.test(fieldBlob) || !/Race/i.test(fieldBlob)) {
      console.error(`FAIL ${stage}: missing GP session fields`);
      process.exit(1);
    }
    if (stage === "predictions_open" || stage === "final_prediction") {
      const hasLink = buttons.some((button) => Boolean(button.url));
      if (predictionUrl && !hasLink) {
        console.error(`FAIL ${stage}: missing prediction button`);
        process.exit(1);
      }
      if (!predictionUrl && hasLink) {
        console.error(`FAIL ${stage}: prediction button present without a configured URL`);
        process.exit(1);
      }
    }
    if (stage === "race_soon") {
      if (!/Predictions are locked/i.test(description) || /still open|Last chance/i.test(`${content}\n${description}`)) {
        console.error("FAIL race_soon: implied predictions still open");
        process.exit(1);
      }
    }
    console.log(`OK ${stage}: role mention, message ${result.messageId}`);
  }

  previousMessageId = result.messageId;
}

const settingsAfter = await getF1ReminderSettings(guildId);
if (settingsAfter?.last_stage_sent !== scheduleBefore.last_stage_sent) {
  console.error(
    `FAIL schedule corrupted: last_stage_sent ${scheduleBefore.last_stage_sent} -> ${settingsAfter?.last_stage_sent}`
  );
  process.exit(1);
}
if (settingsAfter?.current_meeting_id !== scheduleBefore.current_meeting_id) {
  console.error(
    `FAIL schedule corrupted: current_meeting_id ${scheduleBefore.current_meeting_id} -> ${settingsAfter?.current_meeting_id}`
  );
  process.exit(1);
}
if (!settingsAfter?.active_message_id) {
  console.error("FAIL active_message_id not persisted");
  process.exit(1);
}

const previewMeeting = await resolveMeetingForPreview();
if (!previewMeeting) {
  console.error("FAIL could not resolve meeting for stats preview");
  process.exit(1);
}
const statsJson = buildExtraStatsEmbed(buildPreviewRaceResults(previewMeeting)).toJSON();
const statsBlob = (statsJson.fields ?? []).map((field) => `${field.name}: ${field.value}`).join("\n");
if (!/Finishing order/i.test(statsBlob) || !/Pit stops/i.test(statsBlob) || !/Did not finish/i.test(statsBlob)) {
  console.error("FAIL preview statistics embed missing expected sections");
  process.exit(1);
}
console.log("OK preview statistics embed built (same payload as f1:stats:preview)");

console.log(
  `OK schedule unchanged last_stage_sent=${settingsAfter.last_stage_sent} active_message_id=${settingsAfter.active_message_id}`
);
console.log("Smoke test passed");
