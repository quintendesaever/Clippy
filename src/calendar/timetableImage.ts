import { toZonedTime } from "date-fns-tz";
import sharp from "sharp";
import { getGuildId } from "../config.js";
import { supabase } from "../supabase.js";
import { truncateText } from "./eventUtils.js";
import type { GuildTimetable, TimetableEvent } from "./types.js";
import {
  clipEventToGrid,
  createTimelineLayout,
  groupDayEvents,
  packEventsIntoRows,
  type TimelineLayout,
} from "../../shared/timetable/layout.js";
import {
  AVATAR_BORDER,
  AVATAR_OVERLAP,
  AVATAR_SIZE,
  CARD_INNER_PAD,
  CARD_RADIUS,
  FONT,
  GRID_INSET_X,
  HEADER_BODY_GAP,
  HEADER_HEIGHT,
  HOUR_LABEL_FONT_SIZE,
  OUTER_PAD_BOTTOM,
  OUTER_PAD_TOP,
  OUTER_PAD_X,
  ROW_GAP,
  ROW_HEIGHT,
  THEME,
  TIMETABLE_WIDTH,
  TITLE_FONT_SIZE,
  TITLE_LINE_HEIGHT,
  TITLE_MAX_LINES,
} from "../../shared/timetable/theme.js";

const WIDTH = TIMETABLE_WIDTH;

type CardBounds = { x: number; y: number; width: number; height: number };

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function rowTop(rowIndex: number): number {
  return HEADER_HEIGHT + HEADER_BODY_GAP + rowIndex * (ROW_HEIGHT + ROW_GAP);
}

function hourTickX(hourIndex: number, layout: TimelineLayout): number {
  return layout.gridInset + hourIndex * layout.colWidth;
}

function timeToX(hour: number, minute: number, layout: TimelineLayout): number {
  const minutesFromStart = (hour - layout.hourStart) * 60 + minute;
  return layout.gridInset + (minutesFromStart / 60) * layout.colWidth;
}

function createLayout(events: TimetableEvent[], timezone: string): TimelineLayout {
  return createTimelineLayout(events, timezone, WIDTH, GRID_INSET_X);
}

function approxCharWidth(fontSize: number): number {
  return fontSize * 0.58;
}

function wrapText(text: string, maxWidthPx: number, fontSize: number, maxLines: number): string[] {
  if (maxWidthPx <= 0 || maxLines <= 0) return [truncateText(text, 0)];

  const maxChars = Math.max(8, Math.floor(maxWidthPx / approxCharWidth(fontSize)));
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) lines.push(current);
    current = word.length > maxChars ? truncateText(word, maxChars) : word;

    if (lines.length >= maxLines - 1) break;
  }

  if (lines.length < maxLines && current) lines.push(current);

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines).map((line, i) =>
      i === maxLines - 1 ? truncateText(line, maxChars) : line
    );
  }

  if (lines.length === maxLines) {
    const joined = words.join(" ");
    const used = lines.join(" ");
    if (used.length < joined.length) {
      lines[maxLines - 1] = truncateText(lines[maxLines - 1], maxChars);
    }
  }

  return lines.length > 0 ? lines : [truncateText(text, maxChars)];
}

function buildTextLines(
  textX: number,
  cardX: number,
  cardY: number,
  cardWidth: number,
  cardHeight: number,
  cy: number,
  title: string,
  textClipId: string
): string[] {
  const textMaxWidth = cardWidth - (textX - cardX) - CARD_INNER_PAD;
  const titleLines = wrapText(title, textMaxWidth, TITLE_FONT_SIZE, TITLE_MAX_LINES);
  if (titleLines.length === 0 || (titleLines.length === 1 && titleLines[0] === "")) {
    return [];
  }

  const titleBlockHeight = titleLines.length * TITLE_LINE_HEIGHT;
  const blockTop = cy - titleBlockHeight / 2;
  const baselineOffset = TITLE_FONT_SIZE * 0.35;

  const lineTexts = titleLines.map((line, index) => {
    const slotCy = blockTop + index * TITLE_LINE_HEIGHT + TITLE_LINE_HEIGHT / 2;
    const lineY = slotCy + baselineOffset;
    return `<text x="${textX}" y="${lineY}" fill="${THEME.white}" font-size="${TITLE_FONT_SIZE}" font-weight="400" font-family="${FONT}" clip-path="url(#${textClipId})">${escapeXml(line)}</text>`;
  });

  return [
    `<clipPath id="${textClipId}"><rect x="${textX}" y="${cardY}" width="${Math.max(textMaxWidth, 0)}" height="${cardHeight}"/></clipPath>`,
    ...lineTexts,
  ];
}

function cardBounds(
  rowY: number,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
  layout: TimelineLayout
): CardBounds {
  const x = timeToX(startHour, startMinute, layout);
  const endX = timeToX(endHour, endMinute, layout);
  return {
    x,
    y: rowY,
    width: Math.max(endX - x, 2),
    height: ROW_HEIGHT,
  };
}

function discordAvatarUrl(userId: string, avatarHash: string | null): string {
  if (avatarHash) {
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=64`;
  }
  const index = Number((BigInt(userId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

async function fetchAvatarDataUrl(userId: string, avatarHash: string | null): Promise<string> {
  const response = await fetch(discordAvatarUrl(userId, avatarHash));
  if (!response.ok) {
    throw new Error(`Avatar fetch failed for ${userId}: ${response.status}`);
  }
  const png = await sharp(Buffer.from(await response.arrayBuffer()))
    .resize(AVATAR_SIZE, AVATAR_SIZE)
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function loadAvatarDataUrls(
  guildId: string,
  userIds: string[]
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("members")
    .select("user_id, avatar_hash")
    .eq("guild_id", guildId)
    .in("user_id", userIds);

  if (error) {
    console.error("timetable image: load avatars:", error.message);
  }

  const hashByUser = new Map((data ?? []).map((row) => [row.user_id, row.avatar_hash as string | null]));
  const entries = await Promise.all(
    userIds.map(async (userId) => {
      try {
        const dataUrl = await fetchAvatarDataUrl(userId, hashByUser.get(userId) ?? null);
        return [userId, dataUrl] as const;
      } catch (err) {
        console.error("timetable image: avatar fetch:", err);
        return null;
      }
    })
  );

  return new Map(entries.filter((entry): entry is readonly [string, string] => entry !== null));
}

function buildHourHeader(layout: TimelineLayout): string[] {
  const parts: string[] = [
    `<rect x="0" y="0" width="${WIDTH}" height="${HEADER_HEIGHT}" fill="${THEME.dark}"/>`,
    `<line x1="0" y1="${HEADER_HEIGHT}" x2="${WIDTH}" y2="${HEADER_HEIGHT}" stroke="${THEME.border}" stroke-width="1"/>`,
  ];

  for (let i = 0; i < layout.hourCount; i++) {
    const x = layout.gridInset + (i + 0.5) * layout.colWidth;
    parts.push(
      `<text x="${x}" y="${HEADER_HEIGHT / 2 + HOUR_LABEL_FONT_SIZE * 0.35}" fill="${THEME.textMuted}" font-size="${HOUR_LABEL_FONT_SIZE}" font-weight="400" text-anchor="middle" font-family="${FONT}">${formatHourLabel(layout.hourStart + i)}</text>`
    );
  }

  return parts;
}

function buildHourGridLines(y: number, height: number, layout: TimelineLayout): string[] {
  const parts: string[] = [];
  for (let i = 0; i <= layout.hourCount; i++) {
    const x = hourTickX(i, layout);
    parts.push(
      `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + height}" stroke="${THEME.border}" stroke-width="1" stroke-opacity="0.15"/>`
    );
  }
  return parts;
}

function buildAvatarStack(
  startX: number,
  cy: number,
  userIds: string[],
  avatarDataUrls: Map<string, string>,
  idPrefix: string
): { parts: string[]; endX: number } {
  const parts: string[] = [];
  const avatarStep = AVATAR_SIZE - AVATAR_OVERLAP;
  let x = startX;

  userIds.forEach((userId, index) => {
    const dataUrl = avatarDataUrls.get(userId);
    if (!dataUrl) return;

    const clipId = `${idPrefix}-avatar-${index}`;
    const cx = x + AVATAR_SIZE / 2;
    parts.push(
      `<clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${AVATAR_SIZE / 2 - AVATAR_BORDER}"/></clipPath>`,
      `<circle cx="${cx}" cy="${cy}" r="${AVATAR_SIZE / 2}" fill="${THEME.card}"/>`,
      `<image href="${dataUrl}" x="${x}" y="${cy - AVATAR_SIZE / 2}" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" clip-path="url(#${clipId})"/>`
    );
    x += avatarStep;
  });

  const rendered = userIds.filter((id) => avatarDataUrls.has(id)).length;
  const endX = rendered > 0 ? startX + AVATAR_SIZE + avatarStep * (rendered - 1) + 12 : startX;

  return { parts, endX };
}

function buildActivityCard(
  bounds: CardBounds,
  title: string,
  avatarUserIds: string[],
  avatarDataUrls: Map<string, string>,
  cardId: string
): string[] {
  const { x, y, width, height } = bounds;
  const radius = Math.min(CARD_RADIUS, height / 2 - 1, width / 2 - 1);
  const textClipId = `card-${cardId}-text`;
  const cy = y + height / 2;
  const avatarStartX = x + CARD_INNER_PAD;
  const { parts: avatarParts, endX: textX } = buildAvatarStack(
    avatarStartX,
    cy,
    avatarUserIds,
    avatarDataUrls,
    cardId
  );

  return [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${THEME.card}" stroke="${THEME.border}" stroke-width="1"/>`,
    ...avatarParts,
    ...buildTextLines(textX, x, y, width, height, cy, title, textClipId),
  ];
}

function buildRowCards(
  rowIndex: number,
  rowY: number,
  cards: import("../../shared/timetable/layout.js").RenderCard[],
  layout: TimelineLayout,
  timezone: string,
  avatarDataUrls: Map<string, string>
): string[] {
  return cards.flatMap((card, cardIndex) => {
    const times = clipEventToGrid(card.start, card.end, timezone, layout);
    if (!times) return [];

    const bounds = cardBounds(
      rowY,
      times.startHour,
      times.startMinute,
      times.endHour,
      times.endMinute,
      layout
    );
    return buildActivityCard(
      bounds,
      card.title,
      card.userIds,
      avatarDataUrls,
      `${rowIndex}-${card.startMs}-${cardIndex}`
    );
  });
}

function buildRow(
  rowIndex: number,
  cards: import("../../shared/timetable/layout.js").RenderCard[],
  layout: TimelineLayout,
  timezone: string,
  avatarDataUrls: Map<string, string>
): string[] {
  const y = rowTop(rowIndex);
  return [
    `<rect x="0" y="${y}" width="${WIDTH}" height="${ROW_HEIGHT}" fill="${THEME.dark}"/>`,
    ...buildHourGridLines(y, ROW_HEIGHT, layout),
    ...buildRowCards(rowIndex, y, cards, layout, timezone, avatarDataUrls),
  ];
}

function buildTimelineSvg(
  timetable: GuildTimetable,
  dayKey: string,
  avatarDataUrls: Map<string, string>
): string {
  const dayEvents = timetable.eventsByDay.get(dayKey) ?? [];
  const grouped = groupDayEvents(dayEvents);
  const packedRows = packEventsIntoRows(grouped);
  const rowCount = Math.max(packedRows.length, 1);
  const layout = createLayout(dayEvents, timetable.guildTimezone);
  const rowsHeight = rowCount * ROW_HEIGHT + Math.max(0, rowCount - 1) * ROW_GAP;
  const contentHeight = HEADER_HEIGHT + HEADER_BODY_GAP + rowsHeight;
  const svgWidth = WIDTH + 2 * OUTER_PAD_X;
  const svgHeight = contentHeight + OUTER_PAD_TOP + OUTER_PAD_BOTTOM;

  const inner: string[] = [...buildHourHeader(layout)];

  for (let i = 0; i < rowCount; i++) {
    inner.push(...buildRow(i, packedRows[i] ?? [], layout, timetable.guildTimezone, avatarDataUrls));
  }

  const parts: string[] = [
    `<rect width="100%" height="100%" fill="${THEME.dark}"/>`,
    `<g transform="translate(${OUTER_PAD_X}, ${OUTER_PAD_TOP})">`,
    ...inner,
    `</g>`,
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  ${parts.join("\n  ")}
</svg>`;
}

export async function renderTimetablePng(
  timetable: GuildTimetable,
  dayKey: string
): Promise<Buffer> {
  const guildId = getGuildId();
  const dayEvents = timetable.eventsByDay.get(dayKey) ?? [];
  const userIds = [...new Set(dayEvents.map((event) => event.userId))];
  const avatarDataUrls = await loadAvatarDataUrls(guildId, userIds);
  const svg = buildTimelineSvg(timetable, dayKey, avatarDataUrls);
  return sharp(Buffer.from(svg)).png().toBuffer();
}
