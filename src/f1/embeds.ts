import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { formatF1DateTime } from "./timeFormat.js";
import { F1_EMBED_COLOR, F1_STATS_CUSTOM_ID_PREFIX, F1_STATS_PREVIEW_CUSTOM_ID } from "./config.js";
import { usableSprint } from "./schedule.js";
import type { F1Meeting, F1RaceResults, F1ReminderStage, F1StageSchedule } from "./types.js";

const COUNTRY_TO_ISO: Record<string, string> = {
  Australia: "AU",
  Austria: "AT",
  Azerbaijan: "AZ",
  Bahrain: "BH",
  Belgium: "BE",
  Brazil: "BR",
  Canada: "CA",
  China: "CN",
  Hungary: "HU",
  Italy: "IT",
  Japan: "JP",
  Mexico: "MX",
  Monaco: "MC",
  Netherlands: "NL",
  Qatar: "QA",
  "Saudi Arabia": "SA",
  Singapore: "SG",
  Spain: "ES",
  UAE: "AE",
  "United Arab Emirates": "AE",
  UK: "GB",
  "United Kingdom": "GB",
  USA: "US",
  "United States": "US",
};

export type F1MessagePayload = {
  content: string;
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
};

function countryIso(countryName: string, countryCode: string | null): string | null {
  const mapped = COUNTRY_TO_ISO[countryName];
  if (mapped) return mapped.toLowerCase();
  if (countryCode && countryCode.length === 2) return countryCode.toLowerCase();
  return null;
}

function formatWhen(date: Date, timezone: string): string {
  return formatF1DateTime(date, timezone);
}

function applyFlag(embed: EmbedBuilder, meeting: F1Meeting): void {
  const iso = countryIso(meeting.country, meeting.countryCode);
  if (iso) embed.setThumbnail(`https://flagcdn.com/w160/${iso}.png`);
}

function predictionButton(predictionUrl: string | null): ActionRowBuilder<ButtonBuilder>[] {
  if (!predictionUrl) return [];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("🏁 Make predictions")
        .setURL(predictionUrl)
    ),
  ];
}

function statsButton(meetingKey: number, preview: boolean): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(preview ? F1_STATS_PREVIEW_CUSTOM_ID : `${F1_STATS_CUSTOM_ID_PREFIX}${meetingKey}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel("📊 View more statistics")
    ),
  ];
}

function reminderFields(schedule: F1StageSchedule, meeting: F1Meeting, timezone: string) {
  const fields: { name: string; value: string; inline: boolean }[] = [];
  if (schedule.predictionDeadline) {
    fields.push({
      name: "Prediction deadline",
      value: formatWhen(schedule.predictionDeadline, timezone),
      inline: false,
    });
  }
  if (meeting.qualifying && !meeting.qualifying.cancelled) {
    fields.push({
      name: "Qualifying",
      value: formatWhen(meeting.qualifying.dateStart, timezone),
      inline: true,
    });
  }
  if (meeting.race && !meeting.race.cancelled) {
    fields.push({
      name: "Race",
      value: formatWhen(meeting.race.dateStart, timezone),
      inline: true,
    });
  }
  const sprint = usableSprint(meeting);
  if (sprint) {
    fields.push({
      name: "Sprint",
      value: formatWhen(sprint.dateStart, timezone),
      inline: true,
    });
  }
  return fields;
}

export function buildReminderPayload(options: {
  stage: Exclude<F1ReminderStage, "results">;
  meeting: F1Meeting;
  schedule: F1StageSchedule;
  timezone: string;
  roleId: string;
  predictionUrl: string | null;
  now?: Date;
  test?: boolean;
}): F1MessagePayload {
  const { stage, meeting, schedule, timezone, roleId, predictionUrl, test } = options;
  const now = options.now ?? new Date();
  const embed = new EmbedBuilder()
    .setColor(F1_EMBED_COLOR)
    .setFooter({ text: `Times in ${timezone}` })
    .setTimestamp(new Date());
  applyFlag(embed, meeting);

  const roleMention = `<@&${roleId}>`;
  const prefix = test ? "(test) " : "";
  let content = "";
  let title = meeting.name;
  let description = "";

  if (stage === "predictions_open") {
    content = `${roleMention} ${prefix}Predictions are open for the **${meeting.name}**.`;
    title = `${meeting.name} — predictions are open`;
    description = "Submit your predictions before qualifying.";
  } else if (stage === "final_prediction") {
    content = `${roleMention} ${prefix}Don't forget — predictions close soon for the **${meeting.name}**.`;
    title = `${meeting.name} — predictions close soon`;
    description = schedule.predictionDeadline
      ? `Deadline: **${formatWhen(schedule.predictionDeadline, timezone)}**`
      : "Predictions close shortly.";
  } else {
    content = `${roleMention} ${prefix}The **${meeting.name}** race starts in 1 hour.`;
    title = `${meeting.name} — race starts in 1 hour`;
    const deadlinePassed =
      !schedule.predictionDeadline || now.getTime() >= schedule.predictionDeadline.getTime();
    description = deadlinePassed
      ? "Predictions are locked."
      : "Last chance if you have not submitted yet.";
  }

  embed.setTitle(title).setDescription(description).addFields(reminderFields(schedule, meeting, timezone));

  const url = predictionUrl;
  if (!url && (stage === "predictions_open" || stage === "final_prediction")) {
    console.warn(
      "f1 reminder: prediction URL is not configured; omitting Make predictions button. Set /f1-reminder set-prediction-url or F1_PREDICTION_URL."
    );
  }

  return {
    content,
    embeds: [embed],
    components: predictionButton(url),
  };
}

function line(position: number, name: string, team: string | null, extra?: string): string {
  const teamBit = team ? ` — ${team}` : "";
  const extraBit = extra ? ` (${extra})` : "";
  return `**P${position}** ${name}${teamBit}${extraBit}`;
}

export function buildResultsPayload(options: {
  meeting: F1Meeting;
  results: F1RaceResults;
  timezone: string;
  preview?: boolean;
}): F1MessagePayload {
  const { meeting, results, preview } = options;
  const embed = new EmbedBuilder()
    .setColor(F1_EMBED_COLOR)
    .setTitle(preview ? `${meeting.name} — TEST results preview` : `${meeting.name} — race results`)
    .setFooter({
      text: preview
        ? "TEST PREVIEW — sample data, not official results"
        : "Results after the completed race",
    })
    .setTimestamp(new Date());
  applyFlag(embed, meeting);

  const top5 = results.classification.filter((row) => row.position != null).slice(0, 5);
  if (top5.length > 0) {
    embed.addFields({
      name: "Race result",
      value: top5
        .map((row) => line(row.position!, row.name, row.team))
        .join("\n")
        .slice(0, 1024),
      inline: false,
    });
  }

  const stats: string[] = [];
  if (results.fastestLap) {
    const team = results.fastestLap.team ? ` (${results.fastestLap.team})` : "";
    stats.push(`Fastest lap: **${results.fastestLap.name}**${team} — ${results.fastestLap.timeLabel}`);
  }
  if (results.biggestGain) {
    stats.push(
      `Biggest gain: **${results.biggestGain.driver}** P${results.biggestGain.grid} → P${results.biggestGain.finish} (+${results.biggestGain.places})`
    );
  }
  if (results.biggestLoss) {
    stats.push(
      `Biggest loss: **${results.biggestLoss.driver}** P${results.biggestLoss.grid} → P${results.biggestLoss.finish} (${results.biggestLoss.places})`
    );
  }
  if (results.dnfs.length > 0) {
    const names = results.dnfs.map((row) => row.name).join(", ");
    stats.push(`DNF/DNS/DSQ: ${names}`);
  }
  if (stats.length > 0) {
    embed.addFields({ name: "Race notes", value: stats.join("\n").slice(0, 1024), inline: false });
  }

  const drivers = results.driverStandings.slice(0, 5);
  if (drivers.length > 0) {
    embed.addFields({
      name: "Drivers championship",
      value: drivers
        .map((row) => `**P${row.position}** ${row.name} — ${row.points} pts`)
        .join("\n")
        .slice(0, 1024),
      inline: false,
    });
  }

  const teams = results.constructorStandings.slice(0, 3);
  if (teams.length > 0) {
    embed.addFields({
      name: "Constructors championship",
      value: teams
        .map((row) => `**P${row.position}** ${row.name} — ${row.points} pts`)
        .join("\n")
        .slice(0, 1024),
      inline: false,
    });
  }

  return {
    content: "",
    embeds: [embed],
    components: statsButton(meeting.meetingKey, Boolean(preview)),
  };
}

export function buildExtraStatsEmbed(results: F1RaceResults): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(F1_EMBED_COLOR)
    .setTitle(`${results.meetingName} — more statistics`)
    .setTimestamp(new Date());

  if (results.classification.length > 0) {
    const order = results.classification
      .map((row) => {
        const pos = row.position != null ? `P${row.position}` : "—";
        const grid = row.grid != null ? ` (grid P${row.grid})` : "";
        const status = row.statusText ? ` ${row.statusText}` : "";
        const team = row.team ? ` — ${row.team}` : "";
        return `${pos} ${row.name}${team}${grid}${status}`;
      })
      .join("\n")
      .slice(0, 1024);
    embed.addFields({ name: "Finishing order", value: order || "Unavailable", inline: false });
  }

  if (results.fastestLap) {
    const lap = results.fastestLap.lapNumber != null ? ` (lap ${results.fastestLap.lapNumber})` : "";
    embed.addFields({
      name: "Fastest lap",
      value: `${results.fastestLap.name} — ${results.fastestLap.timeLabel}${lap}`,
      inline: false,
    });
  }

  if (results.pitStops.length > 0) {
    embed.addFields({
      name: "Pit stops",
      value: results.pitStops
        .map((row) => `${row.driver}: ${row.stops}`)
        .join("\n")
        .slice(0, 1024),
      inline: false,
    });
  }

  if (results.dnfs.length > 0) {
    embed.addFields({
      name: "Did not finish",
      value: results.dnfs
        .map((row) => `${row.name}${row.statusText ? ` (${row.statusText})` : ""}`)
        .join("\n")
        .slice(0, 1024),
      inline: false,
    });
  }

  return embed;
}
