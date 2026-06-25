import sharp from "sharp";
import { getGuildId } from "../config.js";
import { supabase } from "../supabase.js";
import type { GuildTimetable } from "./types.js";

const WIDTH = 1200;
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

const THEME = {
  dark: "#0b0c10",
  card: "#1a1d26",
  border: "#2d303e",
  textMuted: "#6b7280",
  white: "#ffffff",
} as const;

type CardBounds = { x: number; y: number; width: number; height: number };

type DemoCard = {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  title: string;
  subtitle: string;
  avatarMemberIndices: number[];
};

const HARDCODED_CARDS: Record<number, DemoCard[]> = {
  0: [
    {
      startHour: 10,
      startMinute: 0,
      endHour: 12,
      endMinute: 0,
      title: "Lineaire Algebra",
      subtitle: "Hoorcollege · AUD.D",
      avatarMemberIndices: [0, 1, 2],
    },
    {
      startHour: 13,
      startMinute: 0,
      endHour: 14,
      endMinute: 30,
      title: "Analyse",
      subtitle: "Werkcollege · S9",
      avatarMemberIndices: [0, 1],
    },
  ],
  1: [
    {
      startHour: 11,
      startMinute: 0,
      endHour: 14,
      endMinute: 0,
      title: "Physica",
      subtitle: "Practicum · Lab 3",
      avatarMemberIndices: [1, 2, 3],
    },
  ],
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
    `<text x="${textX}" y="${cy - 3}" fill="${THEME.white}" font-size="14" font-weight="600" font-family="${FONT}">${escapeXml(title)}</text>`,
    `<text x="${textX}" y="${cy + 16}" fill="${THEME.textMuted}" font-size="12" font-family="${FONT}">${escapeXml(subtitle)}</text>`,
  ];
}

function resolveAvatarUserIds(timetable: GuildTimetable, indices: number[]): string[] {
  return indices
    .map((index) => timetable.members[index]?.userId)
    .filter((userId): userId is string => !!userId);
}

function buildHardcodedCards(
  rowIndex: number,
  rowY: number,
  colWidth: number,
  timetable: GuildTimetable,
  avatarDataUrls: Map<string, string>
): string[] {
  const cards = HARDCODED_CARDS[rowIndex] ?? [];
  return cards.flatMap((card, cardIndex) => {
    const bounds = cardBounds(
      rowY,
      card.startHour,
      card.startMinute,
      card.endHour,
      card.endMinute,
      colWidth
    );
    return buildActivityCard(
      bounds,
      card.title,
      card.subtitle,
      resolveAvatarUserIds(timetable, card.avatarMemberIndices),
      avatarDataUrls,
      `${rowIndex}-${cardIndex}`
    );
  });
}

function buildRow(
  rowIndex: number,
  colWidth: number,
  timetable: GuildTimetable,
  avatarDataUrls: Map<string, string>
): string[] {
  const y = rowTop(rowIndex);
  return [
    `<rect x="0" y="${y}" width="${WIDTH}" height="${ROW_HEIGHT}" fill="${THEME.dark}"/>`,
    ...buildHourGridLines(y, ROW_HEIGHT, colWidth),
    ...buildHardcodedCards(rowIndex, y, colWidth, timetable, avatarDataUrls),
  ];
}

function buildTimelineSvg(timetable: GuildTimetable, avatarDataUrls: Map<string, string>): string {
  const rowCount = Math.max(timetable.members.length, 1);
  const colWidth = WIDTH / HOUR_COUNT;
  const height =
    HEADER_HEIGHT + rowCount * ROW_HEIGHT + Math.max(0, rowCount - 1) * ROW_GAP;

  const parts: string[] = [
    buildDefs(),
    `<rect width="100%" height="100%" fill="${THEME.dark}"/>`,
    ...buildHourHeader(colWidth),
  ];

  for (let i = 0; i < rowCount; i++) {
    parts.push(...buildRow(i, colWidth, timetable, avatarDataUrls));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  ${parts.join("\n  ")}
</svg>`;
}

export async function renderTimetablePng(
  timetable: GuildTimetable,
  _dayKey: string
): Promise<Buffer> {
  const guildId = getGuildId();
  const userIds = timetable.members.map((member) => member.userId);
  const avatarDataUrls = await loadAvatarDataUrls(guildId, userIds);
  const svg = buildTimelineSvg(timetable, avatarDataUrls);
  return sharp(Buffer.from(svg)).png().toBuffer();
}
