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
  ACTIVITY_CARD_BORDER,
  ACTIVITY_CARD_FILL,
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
  MIN_CARD_WIDTH,
  NARROW_CARD_AVATAR_SIZE,
  OUTER_PAD_BOTTOM,
  OUTER_PAD_TOP,
  OUTER_PAD_X,
  ROW_GAP,
  ROW_HEIGHT,
  SIDE_BY_SIDE_MIN_WIDTH,
  THEME,
  TIMETABLE_WIDTH,
  TITLE_FONT_SIZE,
  TIME_FONT_SIZE,
  TITLE_LINE_HEIGHT,
  TIME_LINE_HEIGHT,
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

function formatCardTimeRange(start: Date, end: Date, timezone: string): string {
  const s = toZonedTime(start, timezone);
  const e = toZonedTime(end, timezone);
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fmt(s)}–${fmt(e)}`;
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
  timeLabel: string,
  textClipId: string,
  options?: { titleSize?: number; timeSize?: number; titleLineHeight?: number; timeLineHeight?: number; maxLines?: number }
): string[] {
  const titleSize = options?.titleSize ?? TITLE_FONT_SIZE;
  const timeSize = options?.timeSize ?? TIME_FONT_SIZE;
  const titleLh = options?.titleLineHeight ?? TITLE_LINE_HEIGHT;
  const timeLh = options?.timeLineHeight ?? TIME_LINE_HEIGHT;
  const maxLines = options?.maxLines ?? TITLE_MAX_LINES;

  const textMaxWidth = cardWidth - (textX - cardX) - CARD_INNER_PAD;
  const titleLines = wrapText(title, textMaxWidth, titleSize, maxLines);
  if (titleLines.length === 0 || (titleLines.length === 1 && titleLines[0] === "")) {
    return [];
  }

  const titleBlockHeight = titleLines.length * titleLh;
  const blockHeight = titleBlockHeight + timeLh;
  const blockTop = cy - blockHeight / 2;
  const baselineOffset = titleSize * 0.35;

  const lineTexts = titleLines.map((line, index) => {
    const slotCy = blockTop + index * titleLh + titleLh / 2;
    const lineY = slotCy + baselineOffset;
    return `<text x="${textX}" y="${lineY}" fill="${THEME.white}" font-size="${titleSize}" font-weight="400" font-family="${FONT}" clip-path="url(#${textClipId})">${escapeXml(line)}</text>`;
  });

  const timeY = blockTop + titleBlockHeight + timeLh / 2 + timeSize * 0.35;
  lineTexts.push(
    `<text x="${textX}" y="${timeY}" fill="${THEME.textMuted}" font-size="${timeSize}" font-weight="400" font-family="${FONT}" clip-path="url(#${textClipId})">${escapeXml(timeLabel)}</text>`
  );

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
  const gridRight = layout.gridInset + layout.hourCount * layout.colWidth;
  const naturalWidth = Math.max(endX - x, 2);
  const width = Math.min(Math.max(naturalWidth, MIN_CARD_WIDTH), Math.max(gridRight - x, 2));
  return {
    x,
    y: rowY,
    width,
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
    const x = hourTickX(i, layout);
    parts.push(
      `<text x="${x}" y="${HEADER_HEIGHT / 2 + HOUR_LABEL_FONT_SIZE * 0.35}" fill="${THEME.textMuted}" font-size="${HOUR_LABEL_FONT_SIZE}" font-weight="400" text-anchor="start" font-family="${FONT}">${formatHourLabel(layout.hourStart + i)}</text>`
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
  idPrefix: string,
  avatarSize: number = AVATAR_SIZE
): { parts: string[]; endX: number } {
  const parts: string[] = [];
  const overlap = Math.min(AVATAR_OVERLAP, Math.floor(avatarSize * 0.3));
  const avatarStep = avatarSize - overlap;
  let x = startX;

  userIds.forEach((userId, index) => {
    const dataUrl = avatarDataUrls.get(userId);
    if (!dataUrl) return;

    const clipId = `${idPrefix}-avatar-${index}`;
    const cx = x + avatarSize / 2;
    parts.push(
      `<clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${avatarSize / 2 - AVATAR_BORDER}"/></clipPath>`,
      `<circle cx="${cx}" cy="${cy}" r="${avatarSize / 2}" fill="${THEME.card}"/>`,
      `<image href="${dataUrl}" x="${x}" y="${cy - avatarSize / 2}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#${clipId})"/>`
    );
    x += avatarStep;
  });

  const rendered = userIds.filter((id) => avatarDataUrls.has(id)).length;
  const endX = rendered > 0 ? startX + avatarSize + avatarStep * (rendered - 1) + 12 : startX;

  return { parts, endX };
}

function buildStackedCardContent(
  bounds: CardBounds,
  title: string,
  timeLabel: string,
  avatarUserIds: string[],
  avatarDataUrls: Map<string, string>,
  cardId: string
): string[] {
  const { x, y, width, height } = bounds;
  const textClipId = `card-${cardId}-text`;
  const avatarSize = Math.min(NARROW_CARD_AVATAR_SIZE, Math.max(width - CARD_INNER_PAD * 2, 16));
  const contentTop = y + CARD_INNER_PAD;
  const avatarCy = contentTop + avatarSize / 2;
  const avatarStartX = x + (width - avatarSize) / 2;

  const { parts: avatarParts } = buildAvatarStack(
    avatarStartX,
    avatarCy,
    avatarUserIds.slice(0, 1),
    avatarDataUrls,
    cardId,
    avatarSize
  );

  const textX = x + CARD_INNER_PAD;
  const textTop = contentTop + avatarSize + 6;
  const titleSize = Math.min(TITLE_FONT_SIZE, 22);
  const timeSize = Math.min(TIME_FONT_SIZE, 16);
  const titleLh = Math.round(titleSize * 1.2);
  const timeLh = Math.round(timeSize * 1.25);
  const textMaxWidth = Math.max(width - CARD_INNER_PAD * 2, 0);
  const titleLines = wrapText(title, textMaxWidth, titleSize, 1);
  const parts: string[] = [
    ...avatarParts,
    `<clipPath id="${textClipId}"><rect x="${textX}" y="${textTop}" width="${textMaxWidth}" height="${Math.max(height - (textTop - y) - CARD_INNER_PAD, 0)}"/></clipPath>`,
  ];

  if (titleLines[0]) {
    parts.push(
      `<text x="${x + width / 2}" y="${textTop + titleSize * 0.85}" fill="${THEME.white}" font-size="${titleSize}" font-weight="400" text-anchor="middle" font-family="${FONT}" clip-path="url(#${textClipId})">${escapeXml(titleLines[0])}</text>`
    );
  }
  parts.push(
    `<text x="${x + width / 2}" y="${textTop + titleLh + timeSize * 0.85}" fill="${THEME.textMuted}" font-size="${timeSize}" font-weight="400" text-anchor="middle" font-family="${FONT}" clip-path="url(#${textClipId})">${escapeXml(timeLabel)}</text>`
  );

  return parts;
}

function buildTimelineCard(
  bounds: CardBounds,
  title: string,
  timeLabel: string,
  avatarUserIds: string[],
  avatarDataUrls: Map<string, string>,
  cardId: string,
  source: "ics" | "activity"
): string[] {
  const { x, y, width, height } = bounds;
  const radius = Math.min(CARD_RADIUS, height / 2 - 1, width / 2 - 1);
  const borderWidth = 1;
  const innerRadius = Math.max(radius - borderWidth, 0);
  const isActivity = source === "activity";
  const fill = isActivity ? ACTIVITY_CARD_FILL : THEME.card;
  const stroke = isActivity ? ACTIVITY_CARD_BORDER : THEME.border;

  const useStacked = width < SIDE_BY_SIDE_MIN_WIDTH;
  const content = useStacked
    ? buildStackedCardContent(bounds, title, timeLabel, avatarUserIds, avatarDataUrls, cardId)
    : (() => {
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
          ...avatarParts,
          ...buildTextLines(textX, x, y, width, height, cy, title, timeLabel, textClipId),
        ];
      })();

  return [
    `<rect x="${x + borderWidth}" y="${y + borderWidth}" width="${width - borderWidth * 2}" height="${height - borderWidth * 2}" rx="${innerRadius}" ry="${innerRadius}" fill="${fill}"/>`,
    ...content,
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${width - 1}" height="${height - 1}" rx="${radius}" ry="${radius}" fill="none" stroke="${stroke}" stroke-width="${borderWidth}"/>`,
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
    return buildTimelineCard(
      bounds,
      card.title,
      formatCardTimeRange(card.start, card.end, timezone),
      card.userIds,
      avatarDataUrls,
      `${rowIndex}-${card.startMs}-${cardIndex}`,
      card.source
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
