import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { EmbedBuilder, type APIEmbedField } from "discord.js";
import { getDashboardUrl } from "../config.js";
import type { GuildTimetable, TimetableEvent, TimetableRange } from "./types.js";

const TIMETABLE_EMBED_COLOR = 0x5865f2;
const MAX_EMBED_CHARS = 3900;
const MAX_FIELD_VALUE_CHARS = 1000;

function formatEventTime(event: TimetableEvent, timezone: string): string {
  if (event.allDay) return "All day";

  const start = toZonedTime(event.start, timezone);
  const end = toZonedTime(event.end, timezone);
  const startStr = format(start, "HH:mm");
  const endStr = format(end, "HH:mm");
  return `${startStr}–${endStr}`;
}

function formatEventLine(event: TimetableEvent, timezone: string): string {
  const timeLabel = formatEventTime(event, timezone);
  const locationSuffix = event.location ? ` @ ${event.location}` : "";
  return `**${timeLabel}** ${event.initials} · ${event.title}${locationSuffix}`;
}

function formatDayLabel(dayKey: string, timezone: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = toZonedTime(new Date(year, month - 1, day, 12, 0, 0), timezone);
  return format(date, "EEE, MMM d");
}

function buildFooter(timetable: GuildTimetable): string {
  const dashboardUrl = getDashboardUrl();
  const failed = timetable.memberResults.filter((result) => result.error);
  const parts = [`Times in ${timetable.guildTimezone}`, `Full timetable: ${dashboardUrl}`];
  if (failed.length > 0) {
    parts.push(`Could not load: ${failed.map((result) => result.initials).join(", ")}`);
  }
  return parts.join(" · ");
}

function truncateLines(lines: string[], maxChars: number): { text: string; hidden: number } {
  let text = "";
  let used = 0;
  let index = 0;

  for (; index < lines.length; index++) {
    const line = lines[index];
    const nextLength = used + line.length + (used > 0 ? 1 : 0);
    if (nextLength > maxChars) break;
    text += (used > 0 ? "\n" : "") + line;
    used = nextLength;
  }

  const hidden = lines.length - index;
  if (hidden > 0) {
    text += `\n…and ${hidden} more event${hidden === 1 ? "" : "s"}. See the dashboard for the full view.`;
  }

  return { text, hidden };
}

function buildDayFields(
  timetable: GuildTimetable,
  maxTotalChars: number
): { fields: APIEmbedField[]; truncated: boolean } {
  const fields: APIEmbedField[] = [];
  let usedChars = 0;
  let truncated = false;

  for (const [dayKey, dayEvents] of timetable.eventsByDay) {
    const lines = dayEvents.map((event) => formatEventLine(event, timetable.guildTimezone));
    const remaining = maxTotalChars - usedChars;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const { text, hidden } = truncateLines(lines, Math.min(MAX_FIELD_VALUE_CHARS, remaining));
    if (!text) {
      truncated = true;
      break;
    }

    fields.push({
      name: formatDayLabel(dayKey, timetable.guildTimezone),
      value: text,
      inline: false,
    });

    usedChars += text.length;
    if (hidden > 0) {
      truncated = true;
      break;
    }
  }

  return { fields, truncated };
}

export function buildTimetableEmbeds(
  timetable: GuildTimetable,
  range: TimetableRange
): EmbedBuilder[] {
  const dashboardUrl = getDashboardUrl();
  const hasMembers = timetable.memberResults.length > 0;
  const title = range === "today" ? "Today's timetable" : "This week's timetable";

  if (!hasMembers) {
    return [
      new EmbedBuilder()
        .setColor(TIMETABLE_EMBED_COLOR)
        .setTitle(title)
        .setDescription(`No calendars linked yet. Add yours at ${dashboardUrl}`)
        .setFooter({ text: buildFooter(timetable) })
        .setTimestamp(new Date()),
    ];
  }

  if (timetable.events.length === 0) {
    const emptyLabel = range === "today" ? "today" : "this week";
    return [
      new EmbedBuilder()
        .setColor(TIMETABLE_EMBED_COLOR)
        .setTitle(title)
        .setDescription(`No events scheduled for ${emptyLabel}.`)
        .setFooter({ text: buildFooter(timetable) })
        .setTimestamp(new Date()),
    ];
  }

  if (range === "today") {
    const dayEvents = [...timetable.eventsByDay.values()][0] ?? [];
    const lines = dayEvents.map((event) => formatEventLine(event, timetable.guildTimezone));
    const { text } = truncateLines(lines, MAX_EMBED_CHARS);

    return [
      new EmbedBuilder()
        .setColor(TIMETABLE_EMBED_COLOR)
        .setTitle(title)
        .setDescription(text)
        .setFooter({ text: buildFooter(timetable) })
        .setTimestamp(new Date()),
    ];
  }

  const { fields } = buildDayFields(timetable, MAX_EMBED_CHARS);
  const embed = new EmbedBuilder()
    .setColor(TIMETABLE_EMBED_COLOR)
    .setTitle(title)
    .setFooter({ text: buildFooter(timetable) })
    .setTimestamp(new Date());

  if (fields.length > 0) {
    embed.addFields(fields);
  } else {
    embed.setDescription("Too many events to display here. See the dashboard for the full view.");
  }

  return [embed];
}
