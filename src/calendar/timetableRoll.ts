export const TIMETABLE_RECENT_MESSAGE_LIMIT = 100;

export function canRollStaleTimetableMessage(options: {
  isStoredPanel: boolean;
  inRecentHistory: boolean;
}): boolean {
  return options.isStoredPanel || options.inRecentHistory;
}
