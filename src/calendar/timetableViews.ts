import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type APIActionRowComponent,
  type APIButtonComponent,
} from "discord.js";
import { getDashboardUrl } from "../config.js";
import { renderDaySwimlanePng } from "./timetableImage.js";
import { dayKeyInTimezone, getWeekDayKeys, getWeekMondayKey } from "./timetableService.js";
import type { GuildTimetable, TimetableEvent } from "./types.js";

const TIMETABLE_EMBED_COLOR = 0x5865f2;
const DAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za"];
const PNG_ATTACHMENT_NAME = "rooster.png";

export type DaySwimlaneView = {
  embeds: EmbedBuilder[];
  components: APIActionRowComponent<APIButtonComponent>[];
  files?: AttachmentBuilder[];
};

function formatDayTitle(dayKey: string, timezone: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = toZonedTime(new Date(year, month - 1, day, 12, 0, 0), timezone);
  return format(date, "EEEE d MMMM yyyy");
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
  if (!showWeekNav) return [];

  const weekMonday = getWeekMondayKey(new Date(), timetable.guildTimezone);
  const dayKeys = getWeekDayKeys(weekMonday, timetable.guildTimezone);

  const makeDayButton = (dayKey: string, label: string) =>
    new ButtonBuilder()
      .setCustomId(`timetable:day:${dayKey}`)
      .setLabel(label)
      .setStyle(dayKey === selectedDayKey ? ButtonStyle.Primary : ButtonStyle.Secondary);

  const buttons = dayKeys.map((dayKey, i) => {
    const [y, m, d] = dayKey.split("-").map(Number);
    const date = toZonedTime(new Date(y, m - 1, d, 12, 0, 0), timetable.guildTimezone);
    const label = `${DAY_LABELS[i]} ${format(date, "d/M")}`;
    return makeDayButton(dayKey, label);
  });

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(0, 5)).toJSON(),
    new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        buttons[5],
        new ButtonBuilder()
          .setLabel("Volledig rooster")
          .setStyle(ButtonStyle.Link)
          .setURL(`${getDashboardUrl()}/timetable`)
      )
      .toJSON(),
  ];
}

export async function buildDaySwimlaneView(
  timetable: GuildTimetable,
  dayKey: string,
  options?: { showWeekNav?: boolean }
): Promise<DaySwimlaneView> {
  const dashboardUrl = getDashboardUrl();
  const showWeekNav = options?.showWeekNav ?? true;
  const dayTitle = formatDayTitle(dayKey, timetable.guildTimezone);
  const components = buildDayButtons(timetable, dayKey, showWeekNav);

  if (timetable.memberResults.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(TIMETABLE_EMBED_COLOR)
      .setTitle(`Rooster — ${dayTitle}`)
      .setDescription(`Nog geen kalenders gekoppeld. Voeg de jouwe toe op ${dashboardUrl}`)
      .setFooter({ text: buildFooter(timetable) })
      .setTimestamp(new Date());
    return { embeds: [embed], components };
  }

  const png = await renderDaySwimlanePng(timetable, dayKey);

  const embed = new EmbedBuilder()
    .setColor(TIMETABLE_EMBED_COLOR)
    .setTitle(`Rooster — ${dayTitle}`)
    .setFooter({ text: buildFooter(timetable) })
    .setTimestamp(new Date());

  if (!png) {
    embed.setDescription("Geen lessen gepland op deze dag.");
    return { embeds: [embed], components };
  }

  embed.setImage(`attachment://${PNG_ATTACHMENT_NAME}`);

  const files = [
    new AttachmentBuilder(png, { name: PNG_ATTACHMENT_NAME }),
  ];

  return { embeds: [embed], components, files };
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
