import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type APIActionRowComponent,
  type APIButtonComponent,
} from "discord.js";
import { getDashboardUrl } from "../config.js";
import {
  emojiForInitials,
  HOUR_END,
  HOUR_START,
  TOTAL_HOURS,
} from "./eventUtils.js";
import { dayKeyInTimezone, getWeekDayKeys, getWeekMondayKey } from "./timetableService.js";
import type { GuildTimetable, TimetableEvent } from "./types.js";

const TIMETABLE_EMBED_COLOR = 0x5865f2;
const DAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za"];

export type DaySwimlaneView = {
  embeds: EmbedBuilder[];
  components: APIActionRowComponent<APIButtonComponent>[];
};

function formatEventTime(event: TimetableEvent, timezone: string): string {
  if (event.allDay) return "Hele dag";
  const start = toZonedTime(event.start, timezone);
  const end = toZonedTime(event.end, timezone);
  return `${format(start, "HH:mm")}–${format(end, "HH:mm")}`;
}

function formatDayTitle(dayKey: string, timezone: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = toZonedTime(new Date(year, month - 1, day, 12, 0, 0), timezone);
  return format(date, "EEEE d MMMM yyyy");
}

function buildMiniTimeline(events: TimetableEvent[], timezone: string): string {
  const slots = TOTAL_HOURS * 2;
  const grid = Array.from({ length: slots }, () => "·");

  for (const event of events) {
    if (event.allDay) {
      for (let i = 0; i < slots; i++) grid[i] = "█";
      continue;
    }
    const start = toZonedTime(event.start, timezone);
    const end = toZonedTime(event.end, timezone);
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    const from = Math.max(0, Math.floor((startHour - HOUR_START) * 2));
    const to = Math.min(slots, Math.ceil((endHour - HOUR_START) * 2));
    for (let i = from; i < to; i++) grid[i] = "█";
  }

  return grid.join("");
}

function buildMemberFieldValue(events: TimetableEvent[], timezone: string): string {
  const lines = events.map((event) => {
    const badges = event.typeBadges.length ? ` [${event.typeBadges.join("")}]` : "";
    const loc = event.location ? ` @ ${event.location}` : "";
    return `${formatEventTime(event, timezone)} · ${event.title}${badges}${loc}`;
  });
  const timeline = buildMiniTimeline(events, timezone);
  const hourLabels = `${HOUR_START}`.padStart(2, "0") + "      12      " + `${HOUR_END}`;
  return `${lines.join("\n")}\n\`${hourLabels}\`\n\`${timeline}\``;
}

function buildFooter(timetable: GuildTimetable): string {
  const dashboardUrl = getDashboardUrl();
  const failed = timetable.memberResults.filter((result) => result.error);
  const parts = [`Tijden in ${timetable.guildTimezone}`, `Volledig rooster: ${dashboardUrl}`];
  if (failed.length > 0) {
    parts.push(`Niet geladen: ${failed.map((r) => r.initials).join(", ")}`);
  }
  return parts.join(" · ");
}

export function buildDayButtons(
  timetable: GuildTimetable,
  selectedDayKey: string,
  showWeekNav: boolean
): APIActionRowComponent<APIButtonComponent>[] {
  const weekMonday = getWeekMondayKey(new Date(), timetable.guildTimezone);
  const dayKeys = getWeekDayKeys(weekMonday, timetable.guildTimezone);

  const dayRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    dayKeys.map((dayKey, i) => {
      const [y, m, d] = dayKey.split("-").map(Number);
      const date = toZonedTime(new Date(y, m - 1, d, 12, 0, 0), timetable.guildTimezone);
      const label = `${DAY_LABELS[i]} ${format(date, "d/M")}`;
      return new ButtonBuilder()
        .setCustomId(`timetable:day:${dayKey}`)
        .setLabel(label)
        .setStyle(dayKey === selectedDayKey ? ButtonStyle.Primary : ButtonStyle.Secondary);
    })
  );

  const rows: APIActionRowComponent<APIButtonComponent>[] = [dayRow.toJSON()];

  if (showWeekNav) {
    const linkRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("Volledig rooster")
        .setStyle(ButtonStyle.Link)
        .setURL(`${getDashboardUrl()}/timetable`)
    );
    rows.push(linkRow.toJSON());
  }

  return rows;
}

export function buildDaySwimlaneView(
  timetable: GuildTimetable,
  dayKey: string,
  options?: { showWeekNav?: boolean }
): DaySwimlaneView {
  const dashboardUrl = getDashboardUrl();
  const showWeekNav = options?.showWeekNav ?? true;
  const dayTitle = formatDayTitle(dayKey, timetable.guildTimezone);

  if (timetable.memberResults.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(TIMETABLE_EMBED_COLOR)
      .setTitle(`Rooster — ${dayTitle}`)
      .setDescription(`Nog geen kalenders gekoppeld. Voeg de jouwe toe op ${dashboardUrl}`)
      .setFooter({ text: buildFooter(timetable) })
      .setTimestamp(new Date());
    return { embeds: [embed], components: buildDayButtons(timetable, dayKey, showWeekNav) };
  }

  const dayEvents = timetable.eventsByDay.get(dayKey) ?? [];
  const eventsByMember = new Map<string, TimetableEvent[]>();
  for (const event of dayEvents) {
    const bucket = eventsByMember.get(event.userId) ?? [];
    bucket.push(event);
    eventsByMember.set(event.userId, bucket);
  }

  const membersWithEvents = timetable.members.filter(
    (member) => (eventsByMember.get(member.userId)?.length ?? 0) > 0
  );

  const embed = new EmbedBuilder()
    .setColor(TIMETABLE_EMBED_COLOR)
    .setTitle(`Rooster — ${dayTitle}`)
    .setFooter({ text: buildFooter(timetable) })
    .setTimestamp(new Date());

  if (membersWithEvents.length === 0) {
    embed.setDescription("Geen lessen gepland op deze dag.");
    return { embeds: [embed], components: buildDayButtons(timetable, dayKey, showWeekNav) };
  }

  for (const member of membersWithEvents) {
    const events = eventsByMember.get(member.userId) ?? [];
    embed.addFields({
      name: `${emojiForInitials(member.initials)} ${member.initials}`,
      value: buildMemberFieldValue(events, timetable.guildTimezone).slice(0, 1024),
      inline: false,
    });
  }

  return { embeds: [embed], components: buildDayButtons(timetable, dayKey, showWeekNav) };
}

export function getDefaultDayKey(timetable: GuildTimetable): string {
  return dayKeyInTimezone(new Date(), timetable.guildTimezone);
}

export function serializeEventForApi(event: TimetableEvent) {
  return {
    userId: event.userId,
    initials: event.initials,
    title: event.title,
    rawTitle: event.rawTitle,
    typeBadges: event.typeBadges,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    allDay: event.allDay,
    location: event.location ?? null,
  };
}
