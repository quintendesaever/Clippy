import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
  type Role,
} from "discord.js";
import type { Command } from "../types/command.js";
import { getGuildTimezone, formatInTimezone } from "../stats/helpers.js";
import { getF1Timing, isF1TestMode, TEST_F1_TIMING } from "../f1/config.js";
import { resolvePredictionUrl } from "../f1/predictionUrl.js";
import { getF1ReminderSettings, upsertF1ReminderSettings } from "../f1/reminderStorage.js";
import { fetchSeasonMeetings, findActiveMeeting, usableQualifying, usableRace } from "../f1/schedule.js";
import {
  buildStageSchedule,
  latestRelevantStage,
  nextScheduledAction,
} from "../f1/stages.js";
import {
  F1_TEST_STAGES,
  isF1TestStage,
  resolveMeetingForPreview,
  sendF1TestPreview,
} from "../f1/testPreview.js";

function fmt(date: Date | null | undefined, timezone: string): string {
  return date ? formatInTimezone(date, timezone) : "`n/a`";
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const settings = await getF1ReminderSettings(guildId);
  const timing = getF1Timing();
  const now = new Date();
  const meetings = await fetchSeasonMeetings(now);
  const meeting = findActiveMeeting(meetings, now, timing);
  const timezone = await getGuildTimezone(guildId);
  const predictionUrl = resolvePredictionUrl(settings?.prediction_url, process.env.F1_PREDICTION_URL);

  const parts: string[] = [];
  parts.push(`Enabled: **${settings?.enabled ? "yes" : "no"}**`);
  parts.push(`Channel: ${settings?.channel_id ? `<#${settings.channel_id}>` : "`not set`"}`);
  parts.push(`Role: ${settings?.role_id ? `<@&${settings.role_id}>` : "`not set`"}`);
  parts.push(
    `Prediction URL: ${predictionUrl ? "configured" : "`not set` (Make predictions button omitted)"}`
  );
  parts.push(`Timezone: **${timezone}**`);
  parts.push(`Job test mode: **${isF1TestMode() ? "yes (short offsets; dates are not shifted)" : "no"}**`);
  parts.push(`Active message ID: ${settings?.active_message_id ?? "`none`"}`);
  parts.push(`Last stage sent: **${settings?.last_stage_sent ?? "none"}**`);
  parts.push(`Stored meeting id: ${settings?.current_meeting_id ?? "`none`"}`);

  if (meeting) {
    const schedule = buildStageSchedule(meeting, timing);
    const next = nextScheduledAction(
      now,
      schedule,
      settings?.last_stage_sent ?? null,
      settings?.current_meeting_id ?? null
    );
    const relevant = latestRelevantStage(now, schedule);
    parts.push(`Current/next meeting: **${meeting.name}** (\`${meeting.id}\`)`);
    parts.push(`Qualifying: ${fmt(usableQualifying(meeting)?.dateStart, timezone)}`);
    parts.push(`Prediction deadline: ${fmt(schedule.predictionDeadline, timezone)}`);
    parts.push(`Race start: ${fmt(usableRace(meeting)?.dateStart, timezone)}`);
    if (meeting.sprint && !meeting.sprint.cancelled) {
      parts.push(`Sprint: ${fmt(meeting.sprint.dateStart, timezone)}`);
    }
    parts.push(`Latest relevant stage now: **${relevant ?? "none"}**`);
    parts.push(`Next reminder stage: **${next.stage}**`);
    parts.push(`Next scheduled action: ${next.label}${next.at ? ` (${fmt(next.at, timezone)})` : ""}`);
    if (next.waitingForResults) {
      parts.push(
        `Results retry: waiting for published results/standings until ${fmt(schedule.resultsGiveUpAt, timezone)}`
      );
    } else if (schedule.resultsCheckAt && now.getTime() < schedule.resultsCheckAt.getTime()) {
      parts.push(`Results check starts: ${fmt(schedule.resultsCheckAt, timezone)}`);
    }
  } else {
    parts.push("Current/next meeting: `none`");
  }

  await interaction.editReply({ content: parts.join("\n") });
}

async function handleTestSchedule(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const timezone = await getGuildTimezone(guildId);
  const now = new Date();
  const meeting = await resolveMeetingForPreview(now);
  if (!meeting) {
    await interaction.editReply("Couldn't find a Grand Prix to describe.");
    return;
  }

  const real = buildStageSchedule(meeting);
  const compressed = buildStageSchedule(meeting, TEST_F1_TIMING);
  const parts = [
    `**${meeting.name}** — how to test without waiting for the real weekend`,
    "",
    "Immediate Discord previews (recommended):",
    "`/f1-reminder test-send stage:predictions_open`",
    "`/f1-reminder test-send stage:final_prediction`",
    "`/f1-reminder test-send stage:race_soon`",
    "`/f1-reminder test-send stage:results`",
    "Those use the real delete→send→persist lifecycle, mention the role on reminders, and **do not** mark the real schedule as sent.",
    "",
    `Real production schedule (${timezone}):`,
    `• Predictions open: ${fmt(real.predictionsOpenAt, timezone)}`,
    `• Final reminder: ${fmt(real.finalPredictionAt, timezone)}`,
    `• Deadline: ${fmt(real.predictionDeadline, timezone)}`,
    `• Race soon: ${fmt(real.raceSoonAt, timezone)}`,
    `• Results check: ${fmt(real.resultsCheckAt, timezone)}`,
    "",
    "`F1_REMINDER_TEST=1` only shortens poll/offset constants. It does **not** move this Grand Prix to today, so the job still waits for the real session times. Do not enable it in production if you want the real 3-day / 3-hour windows.",
    "",
    `Compressed offsets applied to the same dates (still not shifted): open ${fmt(compressed.predictionsOpenAt, timezone)}, final ${fmt(compressed.finalPredictionAt, timezone)}.`,
  ];
  await interaction.editReply({ content: parts.join("\n") });
}

async function saveSettingsOrError(
  interaction: ChatInputCommandInteraction,
  patch: Parameters<typeof upsertF1ReminderSettings>[0],
  success: string
): Promise<void> {
  const saved = await upsertF1ReminderSettings(patch);
  if (!saved) {
    await interaction.editReply("Could not save F1 reminder settings. Try again later.");
    return;
  }
  await interaction.editReply(success);
}

const f1Reminder: Command = {
  data: new SlashCommandBuilder()
    .setName("f1-reminder")
    .setDescription("Configure F1 prediction reminders for this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName("enable").setDescription("Enable F1 prediction reminders for this server.")
    )
    .addSubcommand((sub) =>
      sub.setName("disable").setDescription("Disable F1 prediction reminders for this server.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-channel")
        .setDescription("Set the channel where F1 reminders will be sent.")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel for the reminders (defaults to current channel).")
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-role")
        .setDescription("Set the role that will be mentioned for F1 prediction reminders.")
        .addRoleOption((opt) =>
          opt.setName("role").setDescription("Role to mention for the reminders.").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-prediction-url")
        .setDescription("Set the destination for the Make predictions button.")
        .addStringOption((opt) =>
          opt
            .setName("url")
            .setDescription("https URL of the prediction page (or 'clear' to remove).")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show F1 reminder settings and scheduler state.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("test-schedule")
        .setDescription("Explain how to test each F1 stage without waiting for a race weekend.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("test-send")
        .setDescription("Preview a reminder stage in the F1 channel without advancing the real schedule.")
        .addStringOption((opt) =>
          opt
            .setName("stage")
            .setDescription("Which stage to preview. Defaults to predictions_open.")
            .addChoices(
              { name: "predictions_open", value: "predictions_open" },
              { name: "final_prediction", value: "final_prediction" },
              { name: "race_soon", value: "race_soon" },
              { name: "results", value: "results" }
            )
        )
    ),
  async execute(interaction) {
    if (!interaction.isChatInputCommand() || !interaction.guild || !interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "status") {
      await handleStatus(interaction);
      return;
    }

    if (sub === "test-schedule") {
      await handleTestSchedule(interaction);
      return;
    }

    if (sub === "test-send") {
      const rawStage = interaction.options.getString("stage") ?? "predictions_open";
      if (!isF1TestStage(rawStage)) {
        await interaction.editReply(`Unknown stage. Use one of: ${F1_TEST_STAGES.join(", ")}.`);
        return;
      }

      const result = await sendF1TestPreview({
        client: interaction.client,
        guildId,
        stage: rawStage,
      });
      if (!result.ok) {
        const hints: Record<string, string> = {
          channel_and_role_required: "Please set both a channel and a role first.",
          no_meeting: "Couldn't find a Grand Prix to preview.",
        };
        await interaction.editReply(hints[result.reason] ?? `Could not send the test message (${result.reason}).`);
        return;
      }

      await interaction.editReply(
        `Sent **${rawStage}** preview for **${result.meetingName}** in the F1 channel (message \`${result.messageId}\`). Real schedule stage is unchanged (\`${result.previousStage ?? "none"}\`).`
      );
      return;
    }

    if (sub === "enable") {
      await saveSettingsOrError(
        interaction,
        { guild_id: guildId, enabled: true },
        "F1 prediction reminders have been **enabled**. Make sure a channel, role, and prediction URL are set."
      );
      return;
    }

    if (sub === "disable") {
      await saveSettingsOrError(
        interaction,
        { guild_id: guildId, enabled: false },
        "F1 prediction reminders have been **disabled** for this server."
      );
      return;
    }

    if (sub === "set-channel") {
      const channelOption = interaction.options.getChannel("channel");
      const channel =
        (channelOption as GuildTextBasedChannel | null) ??
        (interaction.channel as GuildTextBasedChannel | null);

      if (!channel || !("guildId" in channel)) {
        await interaction.editReply("Please choose a text channel in this server.");
        return;
      }

      await saveSettingsOrError(
        interaction,
        { guild_id: guildId, channel_id: channel.id },
        `F1 reminders will be sent in ${channel}.`
      );
      return;
    }

    if (sub === "set-role") {
      const role = interaction.options.getRole("role") as Role | null;
      if (!role || !interaction.guild.roles.cache.has(role.id)) {
        await interaction.editReply("Please choose a valid role from this server.");
        return;
      }

      await saveSettingsOrError(
        interaction,
        { guild_id: guildId, role_id: role.id },
        `F1 reminders will mention ${role}.`
      );
      return;
    }

    if (sub === "set-prediction-url") {
      const raw = interaction.options.getString("url", true).trim();
      if (raw.toLowerCase() === "clear" || raw.toLowerCase() === "none") {
        await saveSettingsOrError(
          interaction,
          { guild_id: guildId, prediction_url: null },
          "Prediction URL cleared. The Make predictions button will be omitted until a URL is set."
        );
        return;
      }

      const url = resolvePredictionUrl(raw, null);
      if (!url) {
        await interaction.editReply(
          "Please provide a public http(s) URL (localhost URLs cannot be used for Discord buttons)."
        );
        return;
      }

      await saveSettingsOrError(
        interaction,
        { guild_id: guildId, prediction_url: url },
        `Prediction button will link to ${url}.`
      );
    }
  },
};

export default f1Reminder;
