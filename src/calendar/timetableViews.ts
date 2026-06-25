import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIActionRowComponent,
  type APIButtonComponent,
} from "discord.js";
import { getDashboardUrl, getPublicDashboardUrl } from "../config.js";
import { renderTimetablePng } from "./timetableImage.js";
import { dayKeyInTimezone, getWeekDayKeys, getWeekMondayKey } from "./timetableService.js";
import type { GuildTimetable, TimetableEvent } from "./types.js";

const DAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za"];
const PNG_ATTACHMENT_NAME = "rooster.png";

export type TimetableView = {
  components: APIActionRowComponent<APIButtonComponent>[];
  files?: AttachmentBuilder[];
  content?: string;
};

function buildDayButtons(
  timetable: GuildTimetable,
  selectedDayKey: string
): APIActionRowComponent<APIButtonComponent>[] {
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

  const secondRow: ButtonBuilder[] = [buttons[5]];
  const publicDashboardUrl = getPublicDashboardUrl();
  if (publicDashboardUrl) {
    secondRow.push(
      new ButtonBuilder()
        .setLabel("Volledig rooster")
        .setStyle(ButtonStyle.Link)
        .setURL(`${publicDashboardUrl}/timetable`)
    );
  }

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(0, 5)).toJSON(),
    new ActionRowBuilder<ButtonBuilder>().addComponents(secondRow).toJSON(),
  ];
}

export async function buildTimetableView(
  timetable: GuildTimetable,
  dayKey: string
): Promise<TimetableView> {
  const dashboardUrl = getDashboardUrl();
  const components = buildDayButtons(timetable, dayKey);

  if (timetable.memberResults.length === 0) {
    return {
      content: `Nog geen kalenders gekoppeld. Voeg de jouwe toe op ${dashboardUrl}`,
      components,
    };
  }

  const dayEvents = timetable.eventsByDay.get(dayKey) ?? [];
  if (dayEvents.length === 0) {
    return { content: "Geen lessen op deze dag.", components };
  }

  const png = await renderTimetablePng(timetable, dayKey);
  const files = [new AttachmentBuilder(png, { name: PNG_ATTACHMENT_NAME })];

  return { components, files };
}

export function toTimetableReply(view: TimetableView) {
  const payload: {
    content?: string;
    components: TimetableView["components"];
    files: AttachmentBuilder[];
  } = {
    components: view.components,
    files: view.files ?? [],
  };
  if (view.content !== undefined) {
    payload.content = view.content;
  }
  return payload;
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
