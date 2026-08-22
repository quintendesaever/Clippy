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
import { readFileSync } from "node:fs";
import path from "node:path";
import { getDashboardUrl, getPublicDashboardUrl } from "../config.js";
import { getVisibleTimetableDayKeys } from "./timetableVisibility.js";
import {
  descriptionContainsLocation,
  redactLocationFromDescription,
} from "../../shared/timetable/eventMeta.js";
import { renderTimetablePng } from "./timetableImage.js";
import { dayKeyInTimezone, getWeekDayKeys, getWeekMondayKey } from "./timetableService.js";
import type { GuildTimetable, TimetableEvent } from "./types.js";

const DAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const PNG_ATTACHMENT_NAME = "rooster.png";
const BUTTONS_PER_ROW = 3;

const EMPTY_DAY_PNG_PATH = path.resolve(process.cwd(), "assets/timetable/empty-day.png");
const emptyDayPng = readFileSync(EMPTY_DAY_PNG_PATH);

export type TimetableView = {
  components: APIActionRowComponent<APIButtonComponent>[];
  files?: AttachmentBuilder[];
  content?: string;
  clearEmbeds?: boolean;
};

function chunkButtons(buttons: ButtonBuilder[]): APIActionRowComponent<APIButtonComponent>[] {
  const rows: APIActionRowComponent<APIButtonComponent>[] = [];
  for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>()
        .addComponents(buttons.slice(i, i + BUTTONS_PER_ROW))
        .toJSON()
    );
  }
  return rows;
}

function buildDayButtons(
  timetable: GuildTimetable,
  selectedDayKey: string
): APIActionRowComponent<APIButtonComponent>[] {
  const weekMonday = getWeekMondayKey(timetable.rangeStart, timetable.guildTimezone);
  const dayKeys = getWeekDayKeys(weekMonday);
  const visibleKeys = getVisibleTimetableDayKeys(timetable);

  const makeDayButton = (dayKey: string, label: string) =>
    new ButtonBuilder()
      .setCustomId(`timetable:day:${dayKey}`)
      .setLabel(label)
      .setStyle(dayKey === selectedDayKey ? ButtonStyle.Primary : ButtonStyle.Secondary);

  const dayButtons = dayKeys.map((dayKey, i) => {
    const [y, m, d] = dayKey.split("-").map(Number);
    const date = toZonedTime(new Date(y, m - 1, d, 12, 0, 0), timetable.guildTimezone);
    const label = `${DAY_LABELS[i]} ${format(date, "d/M")}`;
    return makeDayButton(dayKey, label);
  });

  const visibleDays = visibleKeys.map((dayKey) => dayButtons[dayKeys.indexOf(dayKey)]!);

  const publicDashboardUrl = getPublicDashboardUrl();
  const linkButtons = [
    new ButtonBuilder()
      .setLabel("Volledig Rooster")
      .setStyle(ButtonStyle.Link)
      .setURL(`${publicDashboardUrl}/timetable`),
    new ButtonBuilder()
      .setLabel("Instellingen")
      .setStyle(ButtonStyle.Link)
      .setURL(`${publicDashboardUrl}/settings`),
  ];

  return [...chunkButtons(visibleDays), ...chunkButtons(linkButtons)];
}

function icsLoadFooter(timetable: GuildTimetable): string {
  const failed = timetable.members.filter((member) => member.error);
  if (failed.length === 0) return "";
  if (failed.length === 1) return failed[0]!.error ?? "Een kalender kon niet geladen worden.";
  return `${failed.length} kalenders konden niet geladen worden.`;
}

export { getVisibleTimetableDayKeys } from "./timetableVisibility.js";

export function assembleTimetableView(
  timetable: GuildTimetable,
  dayKey: string,
  png?: Buffer
): TimetableView {
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
    return {
      content: icsLoadFooter(timetable),
      components,
      files: [new AttachmentBuilder(emptyDayPng, { name: PNG_ATTACHMENT_NAME })],
      clearEmbeds: true,
    };
  }

  const file = png ?? emptyDayPng;
  return {
    content: icsLoadFooter(timetable),
    components,
    files: [new AttachmentBuilder(file, { name: PNG_ATTACHMENT_NAME })],
    clearEmbeds: true,
  };
}

export async function buildTimetableView(
  timetable: GuildTimetable,
  dayKey: string,
  png?: Buffer
): Promise<TimetableView> {
  const dayEvents = timetable.eventsByDay.get(dayKey) ?? [];
  if (dayEvents.length > 0 && !png) {
    return assembleTimetableView(timetable, dayKey, await renderTimetablePng(timetable, dayKey));
  }
  return assembleTimetableView(timetable, dayKey, png);
}

export function toTimetableReply(view: TimetableView) {
  const payload: {
    content?: string;
    components: TimetableView["components"];
    files: AttachmentBuilder[];
    embeds?: [];
    attachments: [];
  } = {
    components: view.components,
    files: view.files ?? [],
    attachments: [],
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
    ...(event.participantIds?.length ? { participantIds: event.participantIds } : {}),
  };
}
