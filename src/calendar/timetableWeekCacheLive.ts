import { loadAvatarDataUrls, renderTimetablePng, TIMETABLE_RENDERER_VERSION } from "./timetableImage.js";
import { getGuildTimetable } from "./timetableService.js";
import {
  createTimetableWeekCache,
  TIMETABLE_VALIDATE_INTERVAL_MS,
} from "./timetableWeekCache.js";

export const timetableWeekCache = createTimetableWeekCache({
  fetchTimetable: (guildId, options) => getGuildTimetable(guildId, options),
  renderDay: (timetable, dayKey, avatars) => renderTimetablePng(timetable, dayKey, avatars),
  loadAvatars: (guildId, userIds) => loadAvatarDataUrls(guildId, userIds),
  now: () => Date.now(),
  validateIntervalMs: TIMETABLE_VALIDATE_INTERVAL_MS,
  rendererVersion: TIMETABLE_RENDERER_VERSION,
});
