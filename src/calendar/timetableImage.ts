import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { toZonedTime } from "date-fns-tz";
import sharp from "sharp";
import { getGuildId } from "../config.js";
import { supabase } from "../supabase.js";
import type { GuildTimetable, TimetableEvent } from "./types.js";
import {
  calculateDayLayout,
  clipEventToGrid,
  createTimelineLayout,
  groupAllDayEvents,
  timeToX,
  type RenderCard,
  type TimelineLayout,
} from "../../shared/timetable/layout.js";
import { colorForTypeBadge, labelForTypeBadge } from "../../shared/timetable/eventMeta.js";
import {
  ACTIVITY_CARD_BORDER,
  ACTIVITY_CARD_FILL,
  AVATAR_BORDER,
  AVATAR_SIZE,
  CARD_CONTENT_GAP,
  CARD_GAP,
  CARD_INNER_PAD,
  CARD_RADIUS,
  FONT,
  GRID_INSET_X,
  HEADER_BODY_GAP,
  HEADER_HEIGHT,
  ALL_DAY_ROW_HEIGHT,
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
import {
  avatarStackWidth,
  collectAvatarUserIds,
  pillWidthAt,
  planCardContent,
} from "./timetableCardLayout.js";

const WIDTH = TIMETABLE_WIDTH;

/** Bump when SVG/layout rendering changes so Discord PNG caches invalidate. */
export const TIMETABLE_RENDERER_VERSION = 2;

function resolveInterFontPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "assets/fonts/Inter-Regular.ttf"),
    path.resolve(here, "../../../assets/fonts/Inter-Regular.ttf"),
    path.resolve(here, "../../assets/fonts/Inter-Regular.ttf"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveDejaVuFontPath(): string | null {
  const candidates = [
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/clippy/DejaVuSans.ttf",
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolvePngFont(): { fontFiles: string[]; defaultFontFamily: string } {
  const inter = resolveInterFontPath();
  if (inter) {
    return { fontFiles: [inter], defaultFontFamily: FONT };
  }
  const dejavu = resolveDejaVuFontPath();
  if (dejavu) {
    console.warn("Inter Regular not found; falling back to DejaVu Sans for timetable PNGs.");
    return { fontFiles: [dejavu], defaultFontFamily: "DejaVu Sans" };
  }
  throw new Error(
    "Inter Regular not found and no DejaVu fallback available. Expected assets/fonts/Inter-Regular.ttf"
  );
}

function svgToPng(svg: string): Buffer {
  const font = resolvePngFont();
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: font.fontFiles,
      loadSystemFonts: false,
      defaultFontFamily: font.defaultFontFamily,
    },
  });
  return Buffer.from(resvg.render().asPng());
}

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

function rowTop(rowIndex: number, allDayOffset: number): number {
  return HEADER_HEIGHT + HEADER_BODY_GAP + allDayOffset + rowIndex * (ROW_HEIGHT + ROW_GAP);
}

function createLayout(events: TimetableEvent[], timezone: string): TimelineLayout {
  return createTimelineLayout(events, timezone, WIDTH, GRID_INSET_X);
}

/** Approximate system-ui advances so titles can fill the card without a blunt char cap. */
function titleAdvanceEm(ch: string): number {
  switch (ch) {
    case "i":
    case "l":
    case "I":
    case "j":
    case "'":
    case "|":
      return 0.28;
    case "t":
    case "f":
    case "r":
    case "J":
      return 0.34;
    case " ":
      return 0.26;
    case "-":
    case "–":
    case "—":
      return 0.36;
    case ".":
    case ",":
    case ":":
    case ";":
    case "!":
      return 0.28;
    case "m":
    case "w":
      return 0.82;
    case "M":
    case "W":
      return 0.88;
    case "…":
      return 0.72;
    case "&":
      return 0.64;
    default:
      if (ch >= "A" && ch <= "Z") return 0.64;
      if (ch >= "0" && ch <= "9") return 0.56;
      return 0.52;
  }
}

function titleTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) width += titleAdvanceEm(ch) * fontSize;
  return width * 1.06;
}

function truncateToWidth(text: string, maxPx: number, fontSize: number): string {
  if (titleTextWidth(text, fontSize) <= maxPx) return text;
  const ell = "…";
  const ellW = titleTextWidth(ell, fontSize);
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (titleTextWidth(text.slice(0, mid), fontSize) + ellW <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${text.slice(0, lo)}…` : ell;
}

/** Keep titles inside the rounded card edge instead of clipping the last glyph. */
const TITLE_WRAP_INSET = 8;
/** Don't squeeze a leftover short word onto a nearly full line. */
const TITLE_WRAP_SLACK = 10;

function wrapText(text: string, maxWidthPx: number, fontSize: number, maxLines: number): string[] {
  const maxPx = maxWidthPx - TITLE_WRAP_INSET;
  if (maxPx <= 0 || maxLines <= 0) return ["…"];

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const spaceW = titleTextWidth(" ", fontSize);
  const lines: string[] = [];
  let current = "";
  const queue = [...words];

  const remainingPx = () => maxPx - titleTextWidth(current, fontSize) - (current ? spaceW : 0);

  const pushCurrent = () => {
    if (!current) return;
    lines.push(current);
    current = "";
  };

  while (queue.length > 0 && lines.length < maxLines) {
    const word = queue[0];
    const wordW = titleTextWidth(word, fontSize);
    const room = remainingPx();
    const lastLine = lines.length === maxLines - 1;
    const fits = current ? wordW + TITLE_WRAP_SLACK <= room : wordW <= room;

    if (fits) {
      current = current ? `${current} ${word}` : word;
      queue.shift();
      continue;
    }

    if (current) {
      if (lastLine) {
        const packed = `${current} ${queue.join(" ")}`.trim();
        lines.push(truncateToWidth(packed, maxPx, fontSize));
        queue.length = 0;
        current = "";
        break;
      }
      pushCurrent();
      continue;
    }

    lines.push(truncateToWidth(word, maxPx, fontSize));
    queue.shift();
  }
  pushCurrent();

  if (queue.length > 0 && lines.length > 0) {
    const last = lines[lines.length - 1].replace(/…$/, "");
    lines[lines.length - 1] = truncateToWidth(`${last} ${queue.join(" ")}`.trim(), maxPx, fontSize);
  }

  return lines.length > 0 ? lines.slice(0, maxLines) : [truncateToWidth(text, maxPx, fontSize)];
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

export async function loadAvatarDataUrls(
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

  for (let i = 0; i <= layout.hourCount; i++) {
    const hour = layout.hourStart + i;
    const x = timeToX(hour, 0, layout);
    parts.push(
      `<text x="${x}" y="${HEADER_HEIGHT / 2 + HOUR_LABEL_FONT_SIZE * 0.35}" fill="${THEME.textMuted}" font-size="${HOUR_LABEL_FONT_SIZE}" font-weight="400" text-anchor="middle" font-family="${FONT}">${formatHourLabel(hour)}</text>`
    );
  }

  return parts;
}

function buildHourGridLines(y: number, height: number, layout: TimelineLayout): string[] {
  const parts: string[] = [];
  for (let i = 0; i <= layout.hourCount; i++) {
    const x = timeToX(layout.hourStart + i, 0, layout);
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
  avatarSize: number = AVATAR_SIZE,
  overlap = Math.min(12, Math.floor(avatarSize * 0.3))
): { clipDefs: string[]; parts: string[]; endX: number } {
  const clipDefs: string[] = [];
  const parts: string[] = [];
  const avatarStep = Math.max(avatarSize - overlap, 4);
  let x = startX;

  userIds.forEach((userId, index) => {
    const dataUrl = avatarDataUrls.get(userId);
    if (!dataUrl) return;

    const clipId = `${idPrefix}-avatar-${index}`;
    const cx = x + avatarSize / 2;
    clipDefs.push(
      `<clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${avatarSize / 2 - AVATAR_BORDER}"/></clipPath>`
    );
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${avatarSize / 2}" fill="${THEME.card}"/>`,
      `<image href="${dataUrl}" x="${x}" y="${cy - avatarSize / 2}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#${clipId})"/>`
    );
    x += avatarStep;
  });

  const rendered = userIds.filter((id) => avatarDataUrls.has(id)).length;
  const endX = rendered > 0 ? startX + avatarStackWidth(rendered, avatarSize, overlap) : startX;

  return { clipDefs, parts, endX };
}

function buildCardContent(
  bounds: CardBounds,
  title: string,
  timeLabel: string,
  avatarUserIds: string[],
  avatarDataUrls: Map<string, string>,
  cardId: string,
  typeBadges: string[]
): string[] {
  const { x, y, width, height } = bounds;
  const innerX = x + CARD_INNER_PAD;
  const innerY = y + CARD_INNER_PAD;
  const innerRight = x + width - CARD_INNER_PAD;
  const innerW = Math.max(innerRight - innerX, 0);
  const innerH = Math.max(height - CARD_INNER_PAD * 2, 0);
  if (innerW <= 0 || innerH <= 0) return [];

  const availableIds = avatarUserIds.filter((id) => avatarDataUrls.has(id));
  const badgeLabel = typeBadges[0] ? labelForTypeBadge(typeBadges[0]) : "";
  const plan = planCardContent({
    innerW,
    innerH,
    timeLabel,
    avatarCount: availableIds.length,
    badgeLabel,
  });

  const shownIds = availableIds.slice(0, plan.shownCount);
  const pillW = plan.pillFont > 0 ? pillWidthAt(badgeLabel, plan.pillFont) : 0;
  const pillH = plan.pillFont > 0 ? Math.round(plan.pillFont * 1.7) : 0;
  const stackH = (pillH > 0 ? pillH + CARD_CONTENT_GAP : 0) + plan.timeSize;

  const avatarTop = innerY;
  const avatarCy = plan.stackAvatarsAbove
    ? avatarTop + plan.avatarSize / 2
    : innerY + Math.max(plan.avatarSize, stackH) / 2;
  const { clipDefs: avatarClipDefs, parts: avatarParts, endX: avatarsEndX } = buildAvatarStack(
    innerX,
    avatarCy,
    shownIds,
    avatarDataUrls,
    `card-${cardId}`,
    plan.avatarSize,
    plan.overlap
  );

  const metaX = plan.stackAvatarsAbove || shownIds.length === 0 ? innerX : avatarsEndX + CARD_CONTENT_GAP;
  const metaTop = plan.stackAvatarsAbove
    ? innerY + (shownIds.length > 0 ? plan.avatarSize + CARD_CONTENT_GAP : 0)
    : innerY + (Math.max(plan.avatarSize, stackH) - stackH) / 2;
  const topConsumed = plan.stackAvatarsAbove
    ? (shownIds.length > 0 ? plan.avatarSize + CARD_CONTENT_GAP : 0) + stackH
    : Math.max(shownIds.length > 0 ? plan.avatarSize : 0, stackH);
  const titleTop = innerY + topConsumed + CARD_CONTENT_GAP;
  const titleMaxH = Math.max(y + height - CARD_INNER_PAD - titleTop, 0);
  const titleX = innerX;
  const titleWidth = innerW;
  const bodyClipId = `card-${cardId}-body`;
  const titleClipId = `card-${cardId}-title`;

  let titleSize = TITLE_FONT_SIZE;
  let titleLh = TITLE_LINE_HEIGHT;
  let maxLines = 1;
  if (titleMaxH >= TITLE_LINE_HEIGHT * 2) {
    maxLines = TITLE_MAX_LINES;
  } else if (titleMaxH > 0 && titleMaxH < TITLE_LINE_HEIGHT) {
    titleSize = Math.min(TITLE_FONT_SIZE, Math.max(14, Math.round(titleMaxH * 0.85)));
    titleLh = titleMaxH;
  }

  let titleLines = titleMaxH > 0 ? wrapText(title, titleWidth, titleSize, maxLines) : [];
  while (
    titleMaxH > 0 &&
    titleSize > 16 &&
    titleLines.some((line) => line.includes("…"))
  ) {
    titleSize -= 1;
    titleLh = Math.max(titleSize + 4, Math.min(TITLE_LINE_HEIGHT, titleMaxH / Math.max(maxLines, 1)));
    if (titleMaxH >= titleLh * 2) maxLines = TITLE_MAX_LINES;
    titleLines = wrapText(title, titleWidth, titleSize, maxLines);
  }
  const radius = Math.min(CARD_RADIUS, height / 2 - 1, width / 2 - 1);
  const parts: string[] = [
    `<defs>`,
    `<clipPath id="${bodyClipId}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></clipPath>`,
    titleWidth > 0 && titleMaxH > 0
      ? `<clipPath id="${titleClipId}"><rect x="${titleX}" y="${titleTop}" width="${Math.max(titleWidth - TITLE_WRAP_INSET, 0)}" height="${titleMaxH}"/></clipPath>`
      : "",
    ...avatarClipDefs,
    `</defs>`,
    `<g clip-path="url(#${bodyClipId})">`,
    ...avatarParts,
  ].filter(Boolean);

  if (pillW > 0 && badgeLabel) {
    const pillRadius = pillH / 2;
    const badgeCode = typeBadges[0];
    const badgeColor = colorForTypeBadge(badgeCode);
    parts.push(
      `<rect x="${metaX}" y="${metaTop}" width="${pillW}" height="${pillH}" rx="${pillRadius}" ry="${pillRadius}" fill="${badgeColor}" fill-opacity="0.16"/>`,
      `<text x="${metaX + pillW / 2}" y="${metaTop + pillH / 2 + plan.pillFont * 0.32}" fill="${badgeColor}" font-size="${plan.pillFont}" font-weight="600" text-anchor="middle" font-family="${FONT}">${escapeXml(badgeLabel)}</text>`
    );
  }

  const timeY = metaTop + (pillH > 0 ? pillH + CARD_CONTENT_GAP : 0) + plan.timeSize * 0.85;
  parts.push(
    `<text x="${metaX}" y="${timeY}" fill="${THEME.textMuted}" font-size="${plan.timeSize}" font-weight="400" text-anchor="start" font-family="${FONT}">${escapeXml(timeLabel)}</text>`
  );

  if (titleLines.length > 0 && titleMaxH > 0) {
    for (const [index, line] of titleLines.entries()) {
      if (!line) continue;
      const lineY = titleTop + index * titleLh + titleSize * 0.85;
      parts.push(
        `<text x="${titleX}" y="${lineY}" fill="${THEME.white}" font-size="${titleSize}" font-weight="400" font-family="${FONT}" clip-path="url(#${titleClipId})">${escapeXml(line)}</text>`
      );
    }
  }

  parts.push(`</g>`);
  return parts;
}

function buildTimelineCard(
  bounds: CardBounds,
  title: string,
  timeLabel: string,
  avatarUserIds: string[],
  avatarDataUrls: Map<string, string>,
  cardId: string,
  source: "ics" | "activity",
  typeBadges: string[]
): string[] {
  const { x, y, width, height } = bounds;
  const radius = Math.min(CARD_RADIUS, height / 2 - 1, width / 2 - 1);
  const borderWidth = 1;
  const innerRadius = Math.max(radius - borderWidth, 0);
  const isActivity = source === "activity";
  const fill = isActivity ? ACTIVITY_CARD_FILL : THEME.card;
  const stroke = isActivity ? ACTIVITY_CARD_BORDER : THEME.border;

  return [
    `<rect x="${x + borderWidth}" y="${y + borderWidth}" width="${width - borderWidth * 2}" height="${height - borderWidth * 2}" rx="${innerRadius}" ry="${innerRadius}" fill="${fill}"/>`,
    ...buildCardContent(bounds, title, timeLabel, avatarUserIds, avatarDataUrls, cardId, typeBadges),
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
  const prepared = cards
    .map((card, cardIndex) => {
      const times = clipEventToGrid(card.start, card.end, timezone, layout);
      if (!times) return null;
      return { card, cardIndex, times };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort(
      (a, b) =>
        a.times.startHour * 60 + a.times.startMinute - (b.times.startHour * 60 + b.times.startMinute)
    );

  return prepared.flatMap(({ card, cardIndex, times }) => {
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
      card.source,
      card.typeBadges
    );
  });
}

function buildAllDayStrip(
  cards: RenderCard[],
  avatarDataUrls: Map<string, string>
): string[] {
  const y = HEADER_HEIGHT + HEADER_BODY_GAP;
  const height = ALL_DAY_ROW_HEIGHT;
  const parts: string[] = [
    `<rect x="0" y="${y}" width="${WIDTH}" height="${height}" fill="${THEME.dark}"/>`,
  ];
  if (cards.length === 0) return parts;

  const gap = CARD_GAP;
  const usable = WIDTH - 2 * GRID_INSET_X;
  const cardWidth = Math.max(120, (usable - gap * (cards.length - 1)) / cards.length);
  const avatarSize = 28;

  cards.forEach((card, index) => {
    const x = GRID_INSET_X + index * (cardWidth + gap);
    const fill = card.source === "activity" ? ACTIVITY_CARD_FILL : THEME.card;
    const stroke = card.source === "activity" ? ACTIVITY_CARD_BORDER : THEME.border;
    const cardId = `allday-${index}`;
    parts.push(
      `<rect x="${x}" y="${y + 6}" width="${cardWidth}" height="${height - 12}" rx="${CARD_RADIUS}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`
    );
    const stack = buildAvatarStack(
      x + CARD_INNER_PAD,
      y + height / 2,
      card.userIds,
      avatarDataUrls,
      cardId,
      avatarSize
    );
    parts.push(...stack.clipDefs, ...stack.parts);
    const titleX = stack.endX + 8;
    const titleMax = x + cardWidth - CARD_INNER_PAD - titleX;
    const title = truncateToWidth(card.title, Math.max(titleMax, 12), 16);
    parts.push(
      `<text x="${titleX}" y="${y + height / 2 + 5}" fill="${THEME.white}" font-size="16" font-family="${FONT}">${escapeXml(title)}</text>`
    );
  });

  return parts;
}

function buildRow(
  rowIndex: number,
  cards: RenderCard[],
  layout: TimelineLayout,
  timezone: string,
  avatarDataUrls: Map<string, string>,
  allDayOffset: number
): string[] {
  const y = rowTop(rowIndex, allDayOffset);
  return [
    `<rect x="0" y="${y}" width="${WIDTH}" height="${ROW_HEIGHT}" fill="${THEME.dark}"/>`,
    ...buildHourGridLines(y, ROW_HEIGHT, layout),
    ...buildRowCards(rowIndex, y, cards, layout, timezone, avatarDataUrls),
  ];
}

export function buildTimelineSvg(
  timetable: Pick<GuildTimetable, "eventsByDay" | "guildTimezone">,
  dayKey: string,
  avatarDataUrls: Map<string, string>
): string {
  const dayEvents = timetable.eventsByDay.get(dayKey) ?? [];
  const packedRows = calculateDayLayout(dayEvents);
  const allDayCards = groupAllDayEvents(dayEvents);
  const rowCount = Math.max(packedRows.length, 1);
  const layout = createLayout(dayEvents, timetable.guildTimezone);
  const allDayOffset = allDayCards.length > 0 ? ALL_DAY_ROW_HEIGHT + HEADER_BODY_GAP : 0;
  const rowsHeight = rowCount * ROW_HEIGHT + Math.max(0, rowCount - 1) * ROW_GAP;
  const contentHeight = HEADER_HEIGHT + HEADER_BODY_GAP + allDayOffset + rowsHeight;
  const svgWidth = WIDTH + 2 * OUTER_PAD_X;
  const svgHeight = contentHeight + OUTER_PAD_TOP + OUTER_PAD_BOTTOM;

  const inner: string[] = [...buildHourHeader(layout)];
  if (allDayCards.length > 0) {
    inner.push(...buildAllDayStrip(allDayCards, avatarDataUrls));
  }

  for (let i = 0; i < rowCount; i++) {
    inner.push(
      ...buildRow(i, packedRows[i] ?? [], layout, timetable.guildTimezone, avatarDataUrls, allDayOffset)
    );
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
  dayKey: string,
  avatarDataUrls?: Map<string, string>
): Promise<Buffer> {
  const guildId = getGuildId();
  const dayEvents = timetable.eventsByDay.get(dayKey) ?? [];
  const userIds = collectAvatarUserIds(dayEvents);
  const avatars = avatarDataUrls ?? (await loadAvatarDataUrls(guildId, userIds));
  const svg = buildTimelineSvg(timetable, dayKey, avatars);
  return svgToPng(svg);
}
