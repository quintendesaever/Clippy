import { format } from "date-fns";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { formatTimeInTimezone } from "../../shared/timetable/dates.js";
import { resolveMemberDisplayName } from "../../shared/memberName.js";
import type { MemberLabel } from "../dashboard/memberLabels.js";
import { formatMinutesAsHhmm } from "./time.js";
import {
  LIBRARY_CLEAR_BUTTON_ID,
  LIBRARY_END_FIELD,
  LIBRARY_PLAN_BUTTON_ID,
  LIBRARY_START_FIELD,
  LIBRARY_VISIT_MODAL_ID,
  type LibraryVisit,
} from "./types.js";

export const LIBRARY_EMBED_COLOR = 0x2b6cb0;
const DESCRIPTION_LIMIT = 3900;

export type LibraryViewVisit = LibraryVisit & { displayName: string };

export type LibraryMessagePayload = {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
};

export function libraryVisitDisplayName(
  userId: string,
  labels: Map<string, MemberLabel>
): string {
  const label = labels.get(userId);
  return resolveMemberDisplayName({
    userId,
    displayName: label?.displayName,
    username: label?.username,
  });
}

export function formatLibraryDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return format(new Date(year, month - 1, day, 12, 0, 0), "EEE d MMM yyyy");
}

export function buildLibraryDescription(input: {
  dayKey: string;
  timezone: string;
  openMinutes: number;
  closeMinutes: number;
  visits: Array<{ userId: string; startAt: string; endAt: string; displayName: string }>;
}): string {
  const hours = `${formatMinutesAsHhmm(input.openMinutes)}–${formatMinutesAsHhmm(input.closeMinutes)}`;
  const header = [
    `Open ${hours} · ${input.timezone}`,
    "",
    "**Today's visits**",
  ];

  const sorted = [...input.visits].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const lines =
    sorted.length === 0
      ? ["No visits planned yet."]
      : sorted.map((visit) => {
          const start = formatTimeInTimezone(visit.startAt, input.timezone);
          const end = formatTimeInTimezone(visit.endAt, input.timezone);
          return `\`${start}–${end}\`  ${visit.displayName}`;
        });

  let body = lines.join("\n");
  if (header.join("\n").length + 1 + body.length > DESCRIPTION_LIMIT) {
    const kept: string[] = [];
    let omitted = 0;
    for (const line of lines) {
      const next = [...kept, line].join("\n");
      const suffix = `\n…and ${omitted + (lines.length - kept.length - 1) + 1} more`;
      if (header.join("\n").length + 1 + next.length + suffix.length > DESCRIPTION_LIMIT) {
        omitted = lines.length - kept.length;
        break;
      }
      kept.push(line);
    }
    omitted = lines.length - kept.length;
    body = `${kept.join("\n")}\n…and ${omitted} more`;
  }

  return `${header.join("\n")}\n${body}`;
}

export function buildLibraryPayload(input: {
  dayKey: string;
  timezone: string;
  openMinutes: number;
  closeMinutes: number;
  visits: LibraryVisit[];
  labels: Map<string, MemberLabel>;
}): LibraryMessagePayload {
  const description = buildLibraryDescription({
    dayKey: input.dayKey,
    timezone: input.timezone,
    openMinutes: input.openMinutes,
    closeMinutes: input.closeMinutes,
    visits: input.visits.map((visit) => ({
      userId: visit.user_id,
      startAt: visit.start_at,
      endAt: visit.end_at,
      displayName: libraryVisitDisplayName(visit.user_id, input.labels),
    })),
  });

  const embed = new EmbedBuilder()
    .setColor(LIBRARY_EMBED_COLOR)
    .setTitle(`📚 Library — ${formatLibraryDayLabel(input.dayKey)}`)
    .setDescription(description)
    .setFooter({ text: `Times are in ${input.timezone}` });

  const components = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(LIBRARY_PLAN_BUTTON_ID)
        .setStyle(ButtonStyle.Primary)
        .setLabel("📚 Plan my visit"),
      new ButtonBuilder()
        .setCustomId(LIBRARY_CLEAR_BUTTON_ID)
        .setStyle(ButtonStyle.Secondary)
        .setLabel("🗑️ Clear my time")
    ),
  ];

  return { embeds: [embed], components };
}

export function isLibraryButtonId(customId: string): boolean {
  return customId === LIBRARY_PLAN_BUTTON_ID || customId === LIBRARY_CLEAR_BUTTON_ID;
}

export function isLibraryModalId(customId: string): boolean {
  return customId === LIBRARY_VISIT_MODAL_ID;
}

export function buildVisitModal(): ModalBuilder {
  const start = new TextInputBuilder()
    .setCustomId(LIBRARY_START_FIELD)
    .setLabel("Start (HH:mm)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("09:00")
    .setRequired(true)
    .setMinLength(5)
    .setMaxLength(5);
  const end = new TextInputBuilder()
    .setCustomId(LIBRARY_END_FIELD)
    .setLabel("End (HH:mm)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("12:00")
    .setRequired(true)
    .setMinLength(5)
    .setMaxLength(5);

  return new ModalBuilder()
    .setCustomId(LIBRARY_VISIT_MODAL_ID)
    .setTitle("Plan library visit")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(start),
      new ActionRowBuilder<TextInputBuilder>().addComponents(end)
    );
}
