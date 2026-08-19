export const THEME = {
  dark: "#1C1D22",
  card: "#323338",
  border: "#3f4147",
  textMuted: "#949ba4",
  white: "#dbdee1",
} as const;

/** Matches dashboard `.eventCardActivity` gold mixes on dark cards. */
export const ACTIVITY_CARD_FILL = "#544A37";
export const ACTIVITY_CARD_BORDER = "#8F743E";

export const TIMETABLE_WIDTH = 1100;
export const HOUR_MIN = 6;
export const HOUR_MAX = 24;
/** Default visible window; expands when events fall outside. */
export const DEFAULT_DISPLAY_HOUR_START = 8;
export const DEFAULT_DISPLAY_HOUR_END = 18;
export const HEADER_HEIGHT = 44;
export const ROW_HEIGHT = 112;
export const ROW_GAP = 12;
export const OUTER_PAD_X = 14;
export const OUTER_PAD_TOP = 14;
export const OUTER_PAD_BOTTOM = 12;
export const GRID_INSET_X = 12;
export const HEADER_BODY_GAP = 8;
export const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export const CARD_RADIUS = 14;
export const CARD_INNER_PAD = 14;
/** Gap between adjacent cards so touching time-slots do not visually collide. */
export const CARD_GUTTER = 6;
export const AVATAR_SIZE = 56;
export const AVATAR_OVERLAP = 12;
export const AVATAR_BORDER = 3;
/** Stacked layout when side-by-side avatar+text still doesn't fit. */
export const NARROW_CARD_AVATAR_SIZE = 32;
export const SIDE_BY_SIDE_MIN_WIDTH = AVATAR_SIZE + CARD_INNER_PAD * 2 + 140;
/** Below this width, drop the avatar so title and time use the full card. */
export const COMPACT_CARD_MAX_WIDTH = 140;
export const COMPACT_CARD_PAD = 8;
export const COMPACT_TITLE_FONT_SIZE = 20;
export const COMPACT_TIME_FONT_SIZE = 14;
export const STACKED_CARD_PAD = 8;
export const STACKED_TITLE_FONT_SIZE = 20;
export const STACKED_TIME_FONT_SIZE = 14;

/** Sized so text stays readable after Discord scales the wide PNG down. */
export const TITLE_FONT_SIZE = 28;
export const TIME_FONT_SIZE = 20;
export const HOUR_LABEL_FONT_SIZE = 20;
export const TITLE_LINE_HEIGHT = 34;
export const TIME_LINE_HEIGHT = 26;
export const TITLE_MAX_LINES = 2;
