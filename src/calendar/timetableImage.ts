import { toZonedTime } from "date-fns-tz";
import sharp from "sharp";
import { getGuildId } from "../config.js";
import { supabase } from "../supabase.js";
import { shortLocation, truncateText } from "./eventUtils.js";
import type { GuildTimetable, TimetableEvent } from "./types.js";

// Sized for Discord inline display (~550–800px): wide enough for event labels, fonts that fit card width.
const WIDTH = 1500;
const HOUR_MIN = 8;
const HOUR_MAX = 20;
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 96;
const ROW_GAP = 12;
const OUTER_PAD = 32;
const GRID_INSET_X = 24;
const HEADER_BODY_GAP = 10;
const FONT = "system-ui,-apple-system,sans-serif";

const CARD_RADIUS = 12;
const CARD_INNER_PAD = 14;
const AVATAR_SIZE = 44;
const AVATAR_OVERLAP = 12;
const AVATAR_BORDER = 2;

const TITLE_FONT_SIZE = 20;
const SUBTITLE_FONT_SIZE = 15;
const HOUR_LABEL_FONT_SIZE = 14;
const TITLE_LINE_HEIGHT = 24;
const SUBTITLE_GAP = 6;

const TYPE_LABELS: Record<string, string> = {
  H: "Hoorcollege",
  P: "Practicum",
  W: "Werkcollege",
  L: "Les",
  G: "Groepswerk",
  E: "Exercise",
  S: "Seminar",
};

const THEME = {
  dark: "#1C1D22",
  card: "#323338",
  border: "#2d303e",
  textMuted: "#6b7280",
  white: "#ffffff",
} as const;

type CardBounds = { x: number; y: number; width: number; height: number };

type RenderCard = {
  start: Date;
  end: Date;
  title: string;
  subtitle: string;
  userIds: string[];
  startMs: number;
  endMs: number;
};

type TimelineLayout = {
  hourStart: number;
  hourEnd: number;
  hourCount: number;
  colWidth: number;
  gridInset: number;
};

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

function computeDisplayHourRange(
  events: TimetableEvent[],
  timezone: string
): { hourStart: number; hourEnd: number } {
  const timed = events.filter((event) => !event.allDay);
  if (timed.length === 0) return { hourStart: HOUR_MIN, hourEnd: HOUR_MAX };

  let minMinutes = Infinity;
  let maxMinutes = -Infinity;
  for (const event of timed) {
    const start = toZonedTime(event.start, timezone);
    const end = toZonedTime(event.end, timezone);
    minMinutes = Math.min(minMinutes, start.getHours() * 60 + start.getMinutes());
    maxMinutes = Math.max(maxMinutes, end.getHours() * 60 + end.getMinutes());
  }

  const hourStart = Math.max(HOUR_MIN, Math.floor(minMinutes / 60) - 1);
  let hourEnd = Math.min(HOUR_MAX, Math.ceil(maxMinutes / 60) + 1);
  if (hourEnd - hourStart < 4) {
    hourEnd = Math.min(HOUR_MAX, hourStart + 4);
  }
  return { hourStart, hourEnd };
}

function createLayout(events: TimetableEvent[], timezone: string): TimelineLayout {
  const { hourStart, hourEnd } = computeDisplayHourRange(events, timezone);
  const hourCount = hourEnd - hourStart;
  return {
    hourStart,
    hourEnd,
    hourCount,
    colWidth: (WIDTH - 2 * GRID_INSET_X) / hourCount,
    gridInset: GRID_INSET_X,
  };
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
  subtitle: string,
  textClipId: string
): string[] {
  const textMaxWidth = cardWidth - (textX - cardX) - CARD_INNER_PAD;
  const titleLines = wrapText(title, textMaxWidth, TITLE_FONT_SIZE, 2);
  const subtitleLines = wrapText(subtitle, textMaxWidth, SUBTITLE_FONT_SIZE, 1);
  const titleBlockHeight = titleLines.length * TITLE_LINE_HEIGHT;
  const titleStartY = cy - (titleBlockHeight + SUBTITLE_FONT_SIZE + SUBTITLE_GAP) / 2 + TITLE_FONT_SIZE * 0.85;

  const parts: string[] = [
    `<clipPath id="${textClipId}"><rect x="${textX}" y="${cardY}" width="${Math.max(textMaxWidth, 0)}" height="${cardHeight}"/></clipPath>`,
  ];

  titleLines.forEach((line, index) => {
    parts.push(
      `<text x="${textX}" y="${titleStartY + index * TITLE_LINE_HEIGHT}" fill="${THEME.white}" font-size="${TITLE_FONT_SIZE}" font-weight="400" font-family="${FONT}" clip-path="url(#${textClipId})">${escapeXml(line)}</text>`
    );
  });

  subtitleLines.forEach((line) => {
    parts.push(
      `<text x="${textX}" y="${titleStartY + titleBlockHeight + SUBTITLE_GAP}" fill="${THEME.textMuted}" font-size="${SUBTITLE_FONT_SIZE}" font-family="${FONT}" clip-path="url(#${textClipId})">${escapeXml(line)}</text>`
    );
  });

  return parts;
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

function buildEventSubtitle(event: TimetableEvent): string {
  const typeLabel = event.typeBadges.map((badge) => TYPE_LABELS[badge] ?? badge).join(" · ");
  const location = shortLocation(event.location);
  return [typeLabel, location].filter(Boolean).join(" · ");
}

function clipEventToGrid(
  start: Date,
  end: Date,
  timezone: string,
  layout: TimelineLayout
): { startHour: number; startMinute: number; endHour: number; endMinute: number } | null {
  const startZoned = toZonedTime(start, timezone);
  const endZoned = toZonedTime(end, timezone);
  const startMinutes = startZoned.getHours() * 60 + startZoned.getMinutes();
  const endMinutes = endZoned.getHours() * 60 + endZoned.getMinutes();
  const gridStart = layout.hourStart * 60;
  const gridEnd = layout.hourEnd * 60;

  if (endMinutes <= gridStart || startMinutes >= gridEnd) return null;

  const clippedStart = Math.max(startMinutes, gridStart);
  const clippedEnd = Math.min(endMinutes, gridEnd);
  if (clippedEnd <= clippedStart) return null;

  return {
    startHour: Math.floor(clippedStart / 60),
    startMinute: clippedStart % 60,
    endHour: Math.floor(clippedEnd / 60),
    endMinute: clippedEnd % 60,
  };
}

function groupDayEvents(events: TimetableEvent[]): RenderCard[] {
  const groups = new Map<string, RenderCard>();

  for (const event of events) {
    if (event.allDay) continue;

    const key = `${event.start.getTime()}|${event.end.getTime()}|${event.title.toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) {
      if (!existing.userIds.includes(event.userId)) {
        existing.userIds.push(event.userId);
      }
      continue;
    }

    groups.set(key, {
      start: event.start,
      end: event.end,
      title: event.title,
      subtitle: buildEventSubtitle(event),
      userIds: [event.userId],
      startMs: event.start.getTime(),
      endMs: event.end.getTime(),
    });
  }

  return [...groups.values()].sort((a, b) => a.startMs - b.startMs);
}

function cardsOverlap(a: RenderCard, b: RenderCard): boolean {
  return a.startMs < b.endMs && a.endMs > b.startMs;
}

function packEventsIntoRows(cards: RenderCard[]): RenderCard[][] {
  const rows: RenderCard[][] = [];
  for (const card of cards) {
    let placed = false;
    for (const row of rows) {
      if (!row.some((existing) => cardsOverlap(existing, card))) {
        row.push(card);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push([card]);
  }
  return rows;
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

function buildDefs(): string {
  return `<defs>
    <filter id="cardShadow" x="-8%" y="-12%" width="116%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>`;
}

function buildHourHeader(layout: TimelineLayout): string[] {
  const parts: string[] = [
    `<rect x="0" y="0" width="${WIDTH}" height="${HEADER_HEIGHT}" fill="${THEME.dark}"/>`,
    `<line x1="0" y1="${HEADER_HEIGHT}" x2="${WIDTH}" y2="${HEADER_HEIGHT}" stroke="${THEME.border}" stroke-width="1"/>`,
  ];

  for (let i = 0; i < layout.hourCount; i++) {
    const x = layout.gridInset + (i + 0.5) * layout.colWidth;
    parts.push(
      `<text x="${x}" y="${HEADER_HEIGHT / 2 + HOUR_LABEL_FONT_SIZE * 0.35}" fill="${THEME.textMuted}" font-size="${HOUR_LABEL_FONT_SIZE}" font-weight="500" text-anchor="middle" font-family="${FONT}">${formatHourLabel(layout.hourStart + i)}</text>`
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
  subtitle: string,
  avatarUserIds: string[],
  avatarDataUrls: Map<string, string>,
  cardId: string
): string[] {
  const { x, y, width, height } = bounds;
  const radius = Math.min(CARD_RADIUS, height / 2 - 1, width / 2 - 1);
  const clipId = `card-${cardId}`;
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
    `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></clipPath>`,
    `<g filter="url(#cardShadow)" clip-path="url(#${clipId})">`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${THEME.card}"/>`,
    `</g>`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="none" stroke="${THEME.border}" stroke-width="1"/>`,
    ...avatarParts,
    ...buildTextLines(textX, x, y, width, height, cy, title, subtitle, `${clipId}-text`),
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
    return buildActivityCard(
      bounds,
      card.title,
      card.subtitle,
      card.userIds,
      avatarDataUrls,
      `${rowIndex}-${card.startMs}-${cardIndex}`
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
  const contentHeight = HEADER_HEIGHT + HEADER_BODY_GAP + rowsHeight + HEADER_BODY_GAP;
  const svgWidth = WIDTH + 2 * OUTER_PAD;
  const svgHeight = contentHeight + 2 * OUTER_PAD;

  const inner: string[] = [...buildHourHeader(layout)];

  for (let i = 0; i < rowCount; i++) {
    inner.push(...buildRow(i, packedRows[i] ?? [], layout, timetable.guildTimezone, avatarDataUrls));
  }

  const parts: string[] = [
    buildDefs(),
    `<rect width="100%" height="100%" fill="${THEME.dark}"/>`,
    `<g transform="translate(${OUTER_PAD}, ${OUTER_PAD})">`,
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
