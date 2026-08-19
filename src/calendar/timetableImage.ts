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
  type RenderCard,
  type TimelineLayout,
} from "../../shared/timetable/layout.js";
import {
  ACTIVITY_CARD_BORDER,
  ACTIVITY_CARD_FILL,
  AVATAR_BORDER,
  AVATAR_OVERLAP,
  AVATAR_SIZE,
  CARD_GUTTER,
  CARD_INNER_PAD,
  CARD_RADIUS,
  COMPACT_CARD_MAX_WIDTH,
  COMPACT_CARD_PAD,
  COMPACT_TIME_FONT_SIZE,
  COMPACT_TITLE_FONT_SIZE,
  FONT,
  GRID_INSET_X,
  HEADER_BODY_GAP,
  HEADER_HEIGHT,
  HOUR_LABEL_FONT_SIZE,
  NARROW_CARD_AVATAR_SIZE,
  OUTER_PAD_BOTTOM,
  OUTER_PAD_TOP,
  OUTER_PAD_X,
  ROW_GAP,
  ROW_HEIGHT,
  SIDE_BY_SIDE_MIN_WIDTH,
  STACKED_CARD_PAD,
  STACKED_TIME_FONT_SIZE,
  STACKED_TITLE_FONT_SIZE,
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
  return fontSize * 0.52;
}

function ellipsizeLine(text: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  if (maxLen === 1) return "…";
  const withEllipsis = `${text}…`;
  if (withEllipsis.length <= maxLen) return withEllipsis;
  return `${text.slice(0, maxLen - 1)}…`;
}

function wrapText(text: string, maxWidthPx: number, fontSize: number, maxLines: number): string[] {
  if (maxWidthPx <= 0 || maxLines <= 0) return [];

  const maxChars = Math.max(1, Math.floor(maxWidthPx / approxCharWidth(fontSize)));
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let i = 0;

  while (i < words.length && lines.length < maxLines) {
    const isLastLine = lines.length === maxLines - 1;
    let line = "";

    while (i < words.length) {
      const word = words[i];
      if (!word) break;
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= maxChars) {
        line = candidate;
        i++;
        continue;
      }
      break;
    }

    if (line) {
      if (isLastLine && i < words.length) {
        lines.push(ellipsizeLine(line, maxChars));
        return lines;
      }
      lines.push(line);
      continue;
    }

    const overflowWord = words[i];
    if (!overflowWord) break;

    if (isLastLine) {
      lines.push(truncateText(overflowWord, maxChars));
      return lines;
    }

    lines.push(overflowWord.slice(0, maxChars));
    words[i] = overflowWord.slice(maxChars);
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
  options?: {
    titleSize?: number;
    timeSize?: number;
    titleLineHeight?: number;
    timeLineHeight?: number;
    maxLines?: number;
    pad?: number;
    anchor?: "start" | "middle";
  }
): string[] {
  const titleSize = options?.titleSize ?? TITLE_FONT_SIZE;
  const timeSize = options?.timeSize ?? TIME_FONT_SIZE;
  const titleLh = options?.titleLineHeight ?? TITLE_LINE_HEIGHT;
  const timeLh = options?.timeLineHeight ?? TIME_LINE_HEIGHT;
  const maxLines = options?.maxLines ?? TITLE_MAX_LINES;
  const pad = options?.pad ?? CARD_INNER_PAD;
  const anchor = options?.anchor ?? "start";

  const textMaxWidth = cardWidth - (textX - cardX) - pad;
  const titleLines = wrapText(title, textMaxWidth, titleSize, maxLines);
  if (titleLines.length === 0 || (titleLines.length === 1 && titleLines[0] === "")) {
    return [];
  }

  const titleBlockHeight = titleLines.length * titleLh;
  const blockHeight = titleBlockHeight + timeLh;
  const blockTop = cy - blockHeight / 2;
  const baselineOffset = titleSize * 0.35;

  const textAnchor = anchor === "middle" ? ` text-anchor="middle"` : "";
  const lineTexts = titleLines.map((line, index) => {
    const slotCy = blockTop + index * titleLh + titleLh / 2;
    const lineY = slotCy + baselineOffset;
    return `<text x="${textX}" y="${lineY}" fill="${THEME.white}" font-size="${titleSize}" font-weight="400"${textAnchor} font-family="${FONT}" clip-path="url(#${textClipId})">${escapeXml(line)}</text>`;
  });

  const timeY = blockTop + titleBlockHeight + timeLh / 2 + timeSize * 0.35;
  lineTexts.push(
    `<text x="${textX}" y="${timeY}" fill="${THEME.textMuted}" font-size="${timeSize}" font-weight="400"${textAnchor} font-family="${FONT}" clip-path="url(#${textClipId})">${escapeXml(timeLabel)}</text>`
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
  const startX = timeToX(startHour, startMinute, layout);
  const endX = timeToX(endHour, endMinute, layout);
  const gridRight = layout.gridInset + layout.hourCount * layout.colWidth;
  const slotRight = Math.min(endX, gridRight);
  const slotWidth = Math.max(slotRight - startX, 2);
  const gutter = Math.min(CARD_GUTTER, Math.max(slotWidth - 2, 0));
  return {
    x: startX + gutter / 2,
    y: rowY,
    width: Math.max(slotWidth - gutter, 2),
    height: ROW_HEIGHT,
  };
}

type CardLayoutMode = "sideBySide" | "stacked" | "compact";

function cardLayoutMode(width: number): CardLayoutMode {
  if (width >= SIDE_BY_SIDE_MIN_WIDTH) return "sideBySide";
  if (width >= COMPACT_CARD_MAX_WIDTH) return "stacked";
  return "compact";
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

function buildCompactCardContent(
  bounds: CardBounds,
  title: string,
  timeLabel: string,
  cardId: string
): string[] {
  const { x, y, width, height } = bounds;
  const pad = COMPACT_CARD_PAD;
  const titleSize = COMPACT_TITLE_FONT_SIZE;
  const timeSize = COMPACT_TIME_FONT_SIZE;
  const titleLh = Math.round(titleSize * 1.2);
  const timeLh = Math.round(timeSize * 1.2);
  const textX = x + pad;
  const cy = y + height / 2;
  return buildTextLines(textX, x, y, width, height, cy, title, timeLabel, `card-${cardId}-text`, {
    titleSize,
    timeSize,
    titleLineHeight: titleLh,
    timeLineHeight: timeLh,
    maxLines: TITLE_MAX_LINES,
    pad,
  });
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
  const pad = STACKED_CARD_PAD;
  const textClipId = `card-${cardId}-text`;
  const avatarSize = Math.min(NARROW_CARD_AVATAR_SIZE, Math.max(width - pad * 2, 16));
  const contentTop = y + pad;
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

  const titleSize = STACKED_TITLE_FONT_SIZE;
  const timeSize = STACKED_TIME_FONT_SIZE;
  const titleLh = Math.round(titleSize * 1.1);
  const timeLh = Math.round(timeSize * 1.15);
  const textTop = contentTop + avatarSize + 4;
  const textAreaHeight = Math.max(height - (textTop - y) - pad, 0);
  const maxLines = Math.min(
    TITLE_MAX_LINES,
    Math.max(1, Math.floor((textAreaHeight - timeLh) / titleLh))
  );
  const textX = x + width / 2;
  const textMaxWidth = Math.max(width - pad * 2, 0);
  const titleLines = wrapText(title, textMaxWidth, titleSize, maxLines);
  const titleBlockHeight = titleLines.length * titleLh;
  const parts: string[] = [
    ...avatarParts,
    `<clipPath id="${textClipId}"><rect x="${x + pad}" y="${textTop}" width="${textMaxWidth}" height="${textAreaHeight}"/></clipPath>`,
  ];

  titleLines.forEach((line, index) => {
    const lineY = textTop + index * titleLh + titleSize * 0.85;
    parts.push(
      `<text x="${textX}" y="${lineY}" fill="${THEME.white}" font-size="${titleSize}" font-weight="400" text-anchor="middle" font-family="${FONT}" clip-path="url(#${textClipId})">${escapeXml(line)}</text>`
    );
  });
  parts.push(
    `<text x="${textX}" y="${textTop + titleBlockHeight + timeSize * 0.85}" fill="${THEME.textMuted}" font-size="${timeSize}" font-weight="400" text-anchor="middle" font-family="${FONT}" clip-path="url(#${textClipId})">${escapeXml(timeLabel)}</text>`
  );

  return parts;
}

function buildSideBySideCardContent(
  bounds: CardBounds,
  title: string,
  timeLabel: string,
  avatarUserIds: string[],
  avatarDataUrls: Map<string, string>,
  cardId: string
): string[] {
  const { x, y, width, height } = bounds;
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
  const mode = cardLayoutMode(width);

  const content =
    mode === "compact"
      ? buildCompactCardContent(bounds, title, timeLabel, cardId)
      : mode === "stacked"
        ? buildStackedCardContent(bounds, title, timeLabel, avatarUserIds, avatarDataUrls, cardId)
        : buildSideBySideCardContent(bounds, title, timeLabel, avatarUserIds, avatarDataUrls, cardId);

  return [
    `<rect x="${x + borderWidth}" y="${y + borderWidth}" width="${width - borderWidth * 2}" height="${height - borderWidth * 2}" rx="${innerRadius}" ry="${innerRadius}" fill="${fill}"/>`,
    ...content,
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${width - 1}" height="${height - 1}" rx="${radius}" ry="${radius}" fill="none" stroke="${stroke}" stroke-width="${borderWidth}"/>`,
  ];
}

function buildRowCards(
  rowIndex: number,
  rowY: number,
  cards: RenderCard[],
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
  cards: RenderCard[],
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
