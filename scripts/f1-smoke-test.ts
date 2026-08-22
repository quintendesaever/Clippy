import "dotenv/config";
import { REST, Routes } from "discord.js";
import { getGuildId } from "../src/config.js";
import { F1_STATS_PREVIEW_CUSTOM_ID } from "../src/f1/config.js";
import { createRestDiscordPort } from "../src/f1/discordPort.js";
import { getF1ReminderSettings } from "../src/f1/reminderStorage.js";
import { F1_TEST_STAGES, sendF1TestPreview } from "../src/f1/testPreview.js";

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
    embeds: { title?: string; description?: string; footer?: { text?: string } }[];
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
let previousMessageId = settingsBefore.active_message_id;

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
  const buttons = message.components.flatMap((row) => row.components ?? []);

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
    console.log(`OK results: no role mention, preview stats button, message ${result.messageId}`);
  } else {
    if (!content.includes(`<@&${roleId}>`)) {
      console.error(`FAIL ${stage}: missing role mention`);
      process.exit(1);
    }
    if (stage === "race_soon" && /still open/i.test(`${content}\n${description}`)) {
      console.error("FAIL race_soon: implied predictions still open");
      process.exit(1);
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

console.log(
  `OK schedule unchanged last_stage_sent=${settingsAfter.last_stage_sent} active_message_id=${settingsAfter.active_message_id}`
);
console.log("Smoke test passed");
