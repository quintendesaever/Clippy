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
import {
  descriptionContainsLocation,
  redactLocationFromDescription,
} from "../../shared/timetable/eventMeta.js";
import { renderTimetablePng } from "./timetableImage.js";
import { dayKeyInTimezone, getWeekDayKeys, getWeekMondayKey } from "./timetableService.js";
import type { GuildTimetable, TimetableEvent } from "./types.js";

const DAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za"];
const PNG_ATTACHMENT_NAME = "rooster.png";

export type TimetableView = {
  components: APIActionRowComponent<APIButtonComponent>[];
  files?: AttachmentBuilder[];
  content?: string;
  clearEmbeds?: boolean;
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

  const showSaturday = (timetable.eventsByDay.get(dayKeys[5]) ?? []).length > 0;
  const rows: APIActionRowComponent<APIButtonComponent>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(0, 5)).toJSON(),
  ];

  const secondRow: ButtonBuilder[] = showSaturday ? [buttons[5]] : [];
  const publicDashboardUrl = getPublicDashboardUrl();
  if (publicDashboardUrl) {
    secondRow.push(
      new ButtonBuilder()
        .setLabel("Volledig rooster")
        .setStyle(ButtonStyle.Link)
        .setURL(`${publicDashboardUrl}/timetable`)
    );
  }
  if (secondRow.length > 0) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(secondRow).toJSON());
  }

  return rows;
}

export async function buildTimetableView(
  timetable: GuildTimetable,
  dayKey: string
): Promise<TimetableView> {
  const dashboardUrl = getDashboardUrl();
  const components = buildDayButtons(timetable, dayKey);

  const dayEvents = timetable.eventsByDay.get(dayKey) ?? [];
  if (dayEvents.length === 0) {
    if (timetable.memberResults.length === 0 && timetable.events.length === 0) {
      return {
        content: `Nog geen kalenders gekoppeld. Voeg de jouwe toe op ${dashboardUrl}`,
        components,
        clearEmbeds: true,
      };
    }
    return { content: "Geen lessen of activiteiten op deze dag.", components, clearEmbeds: true };
  }

  const png = await renderTimetablePng(timetable, dayKey);
  const files = [new AttachmentBuilder(png, { name: PNG_ATTACHMENT_NAME })];

  return { components, files, clearEmbeds: true };
}

export function toTimetableReply(view: TimetableView) {
  const payload: {
    content?: string;
    components: TimetableView["components"];
    files: AttachmentBuilder[];
    embeds?: [];
  } = {
    components: view.components,
    files: view.files ?? [],
  };
  if (view.content !== undefined) {
    payload.content = view.content;
  }
  if (view.clearEmbeds) {
    payload.embeds = [];
  }
  return payload;
}

export function getDefaultDayKey(timetable: GuildTimetable): string {
  return dayKeyInTimezone(new Date(), timetable.guildTimezone);
}

export function serializeEventForApi(
  event: TimetableEvent,
  options?: { viewerUserId?: string; showLocationByUser?: Map<string, boolean> }
) {
  const source = event.source ?? "ics";
  const isActivity = source === "activity";
  const hasLocationField = Boolean(event.location?.trim());
  const hasLocationInDescription = descriptionContainsLocation(event.description);
  const hasLocation = hasLocationField || hasLocationInDescription;
  const isOwner = options?.viewerUserId != null && options.viewerUserId === event.userId;
  const ownerAllowsLocation = options?.showLocationByUser?.get(event.userId) === true;
  // Shared activities always show location; ICS follows the member preference.
  const locationVisible = isActivity || isOwner || ownerAllowsLocation;

  return {
    userId: event.userId,
    initials: event.initials,
    title: event.title,
    rawTitle: event.rawTitle,
    typeBadges: event.typeBadges,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    allDay: event.allDay,
    location: locationVisible ? (event.location ?? null) : null,
    locationHidden: hasLocation && !locationVisible,
    description: locationVisible
      ? (event.description ?? null)
      : (redactLocationFromDescription(event.description) ?? null),
    source,
    ...(event.id ? { id: event.id } : {}),
    ...(event.createdBy ? { createdBy: event.createdBy } : {}),
  };
}
