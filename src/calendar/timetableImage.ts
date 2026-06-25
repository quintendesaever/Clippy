import { toZonedTime } from "date-fns-tz";
import sharp from "sharp";
import { getGuildId } from "../config.js";
import { supabase } from "../supabase.js";
import { shortLocation, truncateText } from "./eventUtils.js";
import type { GuildTimetable, TimetableEvent } from "./types.js";

const WIDTH = 4200;
const HOUR_START = 8;
const HOUR_END = 20;
const HOUR_COUNT = HOUR_END - HOUR_START;
const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 96;
const ROW_GAP = 12;
const FONT = "system-ui,-apple-system,sans-serif";

const CARD_RADIUS = 12;
const CARD_INNER_PAD = 16;
const AVATAR_SIZE = 32;
const AVATAR_OVERLAP = 8;
const AVATAR_BORDER = 2;

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
  dark: "#0b0c10",
  card: "#1a1d26",
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
  return HEADER_HEIGHT + rowIndex * (ROW_HEIGHT + ROW_GAP);
}

function hourTickX(hourIndex: number, colWidth: number): number {
  return hourIndex * colWidth;
}

function timeToX(hour: number, minute: number, colWidth: number): number {
  const minutesFromStart = (hour - HOUR_START) * 60 + minute;
  return (minutesFromStart / 60) * colWidth;
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
  const titleLines = wrapText(title, textMaxWidth, 14, 2);
  const subtitleLines = wrapText(subtitle, textMaxWidth, 12, 1);
  const titleLineHeight = 16;
  const titleBlockHeight = titleLines.length * titleLineHeight;
  const titleStartY = cy - (titleBlockHeight + 14) / 2 + 12;

  const parts: string[] = [
    `<clipPath id="${textClipId}"><rect x="${textX}" y="${cardY}" width="${Math.max(textMaxWidth, 0)}" height="${cardHeight}"/></clipPath>`,
  ];

  titleLines.forEach((line, index) => {
    parts.push(
      `<text x="${textX}" y="${titleStartY + index * titleLineHeight}" fill="${THEME.white}" font-size="14" font-weight="600" font-family="${FONT}" clip-path="url(#${textClipId})">${escapeXml(line)}</text>`
    );
  });

  subtitleLines.forEach((line) => {
    parts.push(
      `<text x="${textX}" y="${titleStartY + titleBlockHeight + 4}" fill="${THEME.textMuted}" font-size="12" font-family="${FONT}" clip-path="url(#${textClipId})">${escapeXml(line)}</text>`
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
  colWidth: number
): CardBounds {
  const x = timeToX(startHour, startMinute, colWidth);
  const endX = timeToX(endHour, endMinute, colWidth);
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
  timezone: string
): { startHour: number; startMinute: number; endHour: number; endMinute: number } | null {
  const startZoned = toZonedTime(start, timezone);
  const endZoned = toZonedTime(end, timezone);
  const startMinutes = startZoned.getHours() * 60 + startZoned.getMinutes();
  const endMinutes = endZoned.getHours() * 60 + endZoned.getMinutes();
  const gridStart = HOUR_START * 60;
  const gridEnd = HOUR_END * 60;

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

function buildHourHeader(colWidth: number): string[] {
  const parts: string[] = [
    `<rect x="0" y="0" width="${WIDTH}" height="${HEADER_HEIGHT}" fill="${THEME.dark}"/>`,
    `<line x1="0" y1="${HEADER_HEIGHT}" x2="${WIDTH}" y2="${HEADER_HEIGHT}" stroke="${THEME.border}" stroke-width="1"/>`,
  ];

  for (let i = 0; i < HOUR_COUNT; i++) {
    const x = hourTickX(i, colWidth);
    parts.push(
      `<text x="${x}" y="${HEADER_HEIGHT / 2 + 4}" fill="${THEME.textMuted}" font-size="12" font-weight="500" text-anchor="middle" font-family="${FONT}">${formatHourLabel(HOUR_START + i)}</text>`
    );
  }

  return parts;
}

function buildHourGridLines(y: number, height: number, colWidth: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i <= HOUR_COUNT; i++) {
    const x = hourTickX(i, colWidth);
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
  colWidth: number,
  timezone: string,
  avatarDataUrls: Map<string, string>
): string[] {
  return cards.flatMap((card, cardIndex) => {
    const times = clipEventToGrid(card.start, card.end, timezone);
    if (!times) return [];

    const bounds = cardBounds(
      rowY,
      times.startHour,
      times.startMinute,
      times.endHour,
      times.endMinute,
      colWidth
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
  colWidth: number,
  cards: RenderCard[],
  timezone: string,
  avatarDataUrls: Map<string, string>
): string[] {
  const y = rowTop(rowIndex);
  return [
    `<rect x="0" y="${y}" width="${WIDTH}" height="${ROW_HEIGHT}" fill="${THEME.dark}"/>`,
    ...buildHourGridLines(y, ROW_HEIGHT, colWidth),
    ...buildRowCards(rowIndex, y, cards, colWidth, timezone, avatarDataUrls),
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
  const colWidth = WIDTH / HOUR_COUNT;
  const height =
    HEADER_HEIGHT + rowCount * ROW_HEIGHT + Math.max(0, rowCount - 1) * ROW_GAP;

  const parts: string[] = [
    buildDefs(),
    `<rect width="100%" height="100%" fill="${THEME.dark}"/>`,
    ...buildHourHeader(colWidth),
  ];

  for (let i = 0; i < rowCount; i++) {
    parts.push(...buildRow(i, colWidth, packedRows[i] ?? [], timetable.guildTimezone, avatarDataUrls));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
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
