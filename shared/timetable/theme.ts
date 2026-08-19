export const THEME = {
  dark: "#323338",
  card: "#3E3F44",
  border: "#4E5058",
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
export const ROW_HEIGHT = 132;
export const ROW_GAP = 12;
export const OUTER_PAD_X = 14;
export const OUTER_PAD_TOP = 14;
export const OUTER_PAD_BOTTOM = 12;
/** Side pad so hour labels can be centered on the first/last tick. */
export const GRID_INSET_X = 32;
export const HEADER_BODY_GAP = 8;
export const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export const CARD_RADIUS = 14;
export const CARD_INNER_PAD = 8;
/** Gap between adjacent cards in a row (half applied to each side). */
export const CARD_GAP = 6;
/** Space between the avatar/time row and the title below. */
export const CARD_CONTENT_GAP = 4;
export const AVATAR_SIZE = 52;
export const AVATAR_OVERLAP = 12;
export const AVATAR_BORDER = 2;
/** Short events grow visually to at least this width so text stays readable. */
export const MIN_CARD_WIDTH = 240;

/** Sized so text stays readable after Discord scales the wide PNG down. */
export const TITLE_FONT_SIZE = 25;
export const TIME_FONT_SIZE = 18;
export const HOUR_LABEL_FONT_SIZE = 20;
export const TITLE_LINE_HEIGHT = 30;
export const TIME_LINE_HEIGHT = 22;
export const TITLE_MAX_LINES = 2;
