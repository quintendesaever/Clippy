import {
  AVATAR_OVERLAP,
  AVATAR_SIZE,
  CARD_CONTENT_GAP,
  TIME_FONT_SIZE,
} from "../../shared/timetable/theme.js";

export const MIN_CARD_TIME_FONT = 11;
export const MIN_CARD_AVATAR_SIZE = 18;
export const MIN_CARD_PILL_FONT = 13;
export const MAX_CARD_PILL_FONT = 16;
const COMPACT_OVERLAP_RATIO = 0.55;
const TIME_WIDTH_FACTOR = 0.62;
const BADGE_WIDTH_FACTOR = 0.56;

export type CardContentPlan = {
  timeSize: number;
  avatarSize: number;
  shownCount: number;
  pillFont: number;
  overlap: number;
  /** Avatars on their own row so a narrow card can keep the full time range. */
  stackAvatarsAbove: boolean;
};

export function collectAvatarUserIds(
  events: ReadonlyArray<{ userId: string; participantIds?: string[] }>
): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    ids.add(event.userId);
    for (const id of event.participantIds ?? []) ids.add(id);
  }
  return [...ids];
}

export function estimateTextWidth(text: string, fontSize: number, factor = TIME_WIDTH_FACTOR): number {
  return text.length * fontSize * factor;
}

export function pillWidthAt(label: string, fontSize: number): number {
  if (!label || fontSize <= 0) return 0;
  return estimateTextWidth(label, fontSize, BADGE_WIDTH_FACTOR) + Math.round(fontSize * 1.5);
}

export function pillHeightAt(fontSize: number): number {
  return fontSize > 0 ? Math.round(fontSize * 1.7) : 0;
}

export function avatarOverlapPx(avatarSize: number, compact: boolean): number {
  if (avatarSize <= 0) return 0;
  const ratio = compact ? COMPACT_OVERLAP_RATIO : 0.3;
  const raw = compact ? Math.floor(avatarSize * ratio) : Math.min(AVATAR_OVERLAP, Math.floor(avatarSize * ratio));
  return Math.max(0, Math.min(raw, avatarSize - 4));
}

export function avatarStackWidth(count: number, avatarSize: number, overlap: number): number {
  if (count <= 0 || avatarSize <= 0) return 0;
  const step = Math.max(avatarSize - overlap, 4);
  return avatarSize + step * (count - 1);
}

function metaColumnWidth(timeLabel: string, timeSize: number, pillFont: number, badgeLabel: string): number {
  return Math.max(pillFont > 0 ? pillWidthAt(badgeLabel, pillFont) : 0, estimateTextWidth(timeLabel, timeSize));
}

function metaColumnHeight(timeSize: number, pillFont: number): number {
  const pillH = pillHeightAt(pillFont);
  return (pillH > 0 ? pillH + CARD_CONTENT_GAP : 0) + timeSize;
}

function timeFits(timeLabel: string, timeSize: number, maxWidth: number): boolean {
  return estimateTextWidth(timeLabel, timeSize) <= maxWidth;
}

function avatarSizeCandidates(maxSize: number): number[] {
  const sizes: number[] = [];
  const start = Math.max(MIN_CARD_AVATAR_SIZE, Math.floor(maxSize));
  for (let size = start; size >= MIN_CARD_AVATAR_SIZE; size -= 2) sizes.push(size);
  if (!sizes.includes(MIN_CARD_AVATAR_SIZE)) sizes.push(MIN_CARD_AVATAR_SIZE);
  return sizes;
}

function pillFontCandidates(hasBadge: boolean): number[] {
  return hasBadge ? [MAX_CARD_PILL_FONT, 14, MIN_CARD_PILL_FONT, 0] : [0];
}

function timeSizeCandidates(): number[] {
  const sizes: number[] = [];
  for (let size = TIME_FONT_SIZE; size >= MIN_CARD_TIME_FONT; size--) sizes.push(size);
  return sizes;
}

export function planCardContent(input: {
  innerW: number;
  innerH: number;
  timeLabel: string;
  avatarCount: number;
  badgeLabel: string;
}): CardContentPlan {
  const { innerW, innerH, timeLabel, avatarCount, badgeLabel } = input;
  const fallback: CardContentPlan = {
    timeSize: MIN_CARD_TIME_FONT,
    avatarSize: 0,
    shownCount: 0,
    pillFont: 0,
    overlap: 0,
    stackAvatarsAbove: false,
  };
  if (innerW <= 0 || innerH <= 0) return fallback;

  const trySide = (count: number, requireBadge: boolean): CardContentPlan | null => {
    if (count <= 0) {
      for (const pillFont of pillFontCandidates(requireBadge && Boolean(badgeLabel))) {
        if (requireBadge && pillFont <= 0) continue;
        for (const timeSize of timeSizeCandidates()) {
          if (!timeFits(timeLabel, timeSize, innerW)) continue;
          if (metaColumnWidth(timeLabel, timeSize, pillFont, badgeLabel) > innerW) continue;
          if (metaColumnHeight(timeSize, pillFont) > innerH) continue;
          return {
            timeSize,
            avatarSize: 0,
            shownCount: 0,
            pillFont,
            overlap: 0,
            stackAvatarsAbove: false,
          };
        }
      }
      return null;
    }

    for (const avatarSize of avatarSizeCandidates(Math.min(AVATAR_SIZE, innerH * 0.7))) {
      for (const compact of [false, true]) {
        const overlap = avatarOverlapPx(avatarSize, compact);
        const avW = avatarStackWidth(count, avatarSize, overlap);
        const remainW = innerW - avW - CARD_CONTENT_GAP;
        if (remainW <= 0) continue;
        for (const pillFont of pillFontCandidates(requireBadge && Boolean(badgeLabel))) {
          if (requireBadge && pillFont <= 0) continue;
          for (const timeSize of timeSizeCandidates()) {
            if (!timeFits(timeLabel, timeSize, remainW)) continue;
            if (metaColumnWidth(timeLabel, timeSize, pillFont, badgeLabel) > remainW) continue;
            if (metaColumnHeight(timeSize, pillFont) > innerH) continue;
            return {
              timeSize,
              avatarSize,
              shownCount: count,
              pillFont,
              overlap,
              stackAvatarsAbove: false,
            };
          }
        }
      }
    }
    return null;
  };

  const tryStack = (count: number, requireBadge: boolean): CardContentPlan | null => {
    const sizes = count > 0 ? avatarSizeCandidates(Math.min(AVATAR_SIZE, innerH * 0.55)) : [0];
    for (const avatarSize of sizes) {
      for (const compact of count > 0 ? [false, true] : [false]) {
        const overlap = avatarOverlapPx(avatarSize, compact);
        const avW = avatarStackWidth(count, avatarSize, overlap);
        if (count > 0 && avW > innerW) continue;
        const remainingH = count > 0 ? innerH - avatarSize - CARD_CONTENT_GAP : innerH;
        if (remainingH <= 0) continue;
        for (const pillFont of pillFontCandidates(requireBadge && Boolean(badgeLabel))) {
          if (requireBadge && pillFont <= 0) continue;
          for (const timeSize of timeSizeCandidates()) {
            if (!timeFits(timeLabel, timeSize, innerW)) continue;
            if (pillFont > 0 && pillWidthAt(badgeLabel, pillFont) > innerW) continue;
            if (metaColumnHeight(timeSize, pillFont) > remainingH) continue;
            return {
              timeSize,
              avatarSize,
              shownCount: count,
              pillFont,
              overlap,
              stackAvatarsAbove: count > 0,
            };
          }
        }
      }
    }
    return null;
  };

  const hasBadge = Boolean(badgeLabel);
  const counts = avatarCount > 0 ? Array.from({ length: avatarCount }, (_, i) => avatarCount - i) : [0];

  for (const count of counts) {
    const found =
      trySide(count, hasBadge) ??
      tryStack(count, hasBadge) ??
      (hasBadge ? trySide(count, false) : null) ??
      (hasBadge ? tryStack(count, false) : null);
    if (found) return found;
  }

  return (
    trySide(0, false) ??
    tryStack(0, false) ??
    fallback
  );
}
