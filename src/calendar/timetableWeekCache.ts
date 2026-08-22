import { dayKeyInTimezone, getWeekDayKeys, getWeekMondayKey } from "../../shared/timetable/dates.js";
import { hashGuildTimetable, resolveSelectedDay } from "./timetableHash.js";
import type { GuildTimetable } from "./types.js";

export const TIMETABLE_VALIDATE_INTERVAL_MS = 20 * 60 * 1000;

export type FetchTimetableOptions = {
  skipIcsCache?: boolean;
};

export type WeekCacheEntry = {
  weekMonday: string;
  calendarDayKey: string;
  selectedDayKey: string;
  dataHash: string;
  validatedAt: number;
  lastFetchAttemptAt: number;
  timetable: GuildTimetable;
  images: Map<string, Buffer>;
};

export type TimetableWeekCacheDeps = {
  fetchTimetable: (guildId: string, options?: FetchTimetableOptions) => Promise<GuildTimetable>;
  renderDay: (
    timetable: GuildTimetable,
    dayKey: string,
    avatars?: Map<string, string>
  ) => Promise<Buffer>;
  loadAvatars: (guildId: string, userIds: string[]) => Promise<Map<string, string>>;
  now: () => number;
  validateIntervalMs: number;
  rendererVersion: number;
  log?: (message: string) => void;
};

export type RefreshCacheOptions = {
  force?: boolean;
  skipIcsCache?: boolean;
  preferToday?: boolean;
  selectedDayKey?: string;
};

function daysWithEvents(timetable: GuildTimetable): string[] {
  return [...timetable.eventsByDay.entries()]
    .filter(([, events]) => events.length > 0)
    .map(([dayKey]) => dayKey);
}

export function createTimetableWeekCache(deps: TimetableWeekCacheDeps) {
  const entries = new Map<string, WeekCacheEntry>();
  const inflight = new Map<string, Promise<WeekCacheEntry>>();

  const log = (message: string) => {
    (deps.log ?? ((line: string) => console.log(line)))(message);
  };

  function peek(guildId: string): WeekCacheEntry | undefined {
    return entries.get(guildId);
  }

  function selectDay(guildId: string, dayKey: string): WeekCacheEntry | null {
    const entry = entries.get(guildId);
    if (!entry) return null;
    const weekKeys = getWeekDayKeys(entry.weekMonday);
    if (!weekKeys.includes(dayKey)) return null;
    entry.selectedDayKey = dayKey;
    return entry;
  }

  async function rebuild(
    guildId: string,
    previous: WeekCacheEntry | undefined,
    options: RefreshCacheOptions
  ): Promise<WeekCacheEntry> {
    const timetable = await deps.fetchTimetable(guildId, {
      skipIcsCache: options.skipIcsCache,
    });
    const weekMonday = getWeekMondayKey(timetable.rangeStart, timetable.guildTimezone);
    const weekKeys = getWeekDayKeys(weekMonday);
    const todayKey = dayKeyInTimezone(new Date(deps.now()), timetable.guildTimezone);
    const dataHash = hashGuildTimetable(timetable, deps.rendererVersion);
    const selectedDayKey = resolveSelectedDay({
      todayKey,
      weekKeys,
      previouslySelected: options.selectedDayKey ?? previous?.selectedDayKey,
      preferToday: options.preferToday ?? false,
    });

    if (previous && previous.weekMonday === weekMonday && previous.dataHash === dataHash) {
      previous.timetable = timetable;
      previous.validatedAt = deps.now();
      previous.lastFetchAttemptAt = deps.now();
      previous.calendarDayKey = todayKey;
      previous.selectedDayKey = selectedDayKey;
      log(`[Timetable] Cache valid for guild ${guildId}`);
      return previous;
    }

    const reason =
      previous && previous.weekMonday !== weekMonday
        ? "Week rollover detected"
        : previous
          ? "Timetable changed, rebuilding"
          : "Building cache";
    log(`[Timetable] ${reason} for guild ${guildId}`);

    const images = new Map<string, Buffer>();
    const renderDays = daysWithEvents(timetable);
    const userIds = [...new Set(timetable.events.map((event) => event.userId))];
    let avatars = new Map<string, string>();
    try {
      avatars = await deps.loadAvatars(guildId, userIds);
    } catch (err) {
      console.error(`[Timetable] Avatar load failed for guild ${guildId}:`, err);
    }

    await Promise.all(
      renderDays.map(async (dayKey) => {
        try {
          const png = await deps.renderDay(timetable, dayKey, avatars);
          images.set(dayKey, png);
        } catch (err) {
          console.error(`[Timetable] Render failed for guild ${guildId} day ${dayKey}:`, err);
          const previousPng = previous?.images.get(dayKey);
          if (previousPng) images.set(dayKey, previousPng);
        }
      })
    );

    const entry: WeekCacheEntry = {
      weekMonday,
      calendarDayKey: todayKey,
      selectedDayKey,
      dataHash,
      validatedAt: deps.now(),
      lastFetchAttemptAt: deps.now(),
      timetable,
      images,
    };
    entries.set(guildId, entry);
    return entry;
  }

  function isFreshForCurrentWeek(entry: WeekCacheEntry): boolean {
    const weekMonday = getWeekMondayKey(new Date(deps.now()), entry.timetable.guildTimezone);
    if (entry.weekMonday !== weekMonday) return false;
    return deps.now() - entry.validatedAt < deps.validateIntervalMs;
  }

  async function refresh(guildId: string, options: RefreshCacheOptions = {}): Promise<WeekCacheEntry> {
    const pending = inflight.get(guildId);
    if (pending) {
      const inFlightEntry = await pending;
      if (!options.force && !options.skipIcsCache && isFreshForCurrentWeek(inFlightEntry)) {
        if (options.preferToday) {
          inFlightEntry.selectedDayKey = dayKeyInTimezone(
            new Date(deps.now()),
            inFlightEntry.timetable.guildTimezone
          );
          inFlightEntry.calendarDayKey = inFlightEntry.selectedDayKey;
        } else if (options.selectedDayKey) {
          selectDay(guildId, options.selectedDayKey);
        }
        return inFlightEntry;
      }
    }

    const existing = entries.get(guildId);
    if (!options.force && !options.skipIcsCache && existing && isFreshForCurrentWeek(existing)) {
      if (options.preferToday) {
        existing.selectedDayKey = dayKeyInTimezone(new Date(deps.now()), existing.timetable.guildTimezone);
        existing.calendarDayKey = existing.selectedDayKey;
      } else if (options.selectedDayKey) {
        existing.selectedDayKey = options.selectedDayKey;
      }
      return existing;
    }

    const promise = rebuild(guildId, existing, options);
    inflight.set(guildId, promise);
    try {
      return await promise;
    } catch (err) {
      if (existing) {
        existing.lastFetchAttemptAt = deps.now();
        existing.validatedAt = deps.now();
        console.error(`[Timetable] Refresh failed for guild ${guildId}; keeping last valid cache:`, err);
        return existing;
      }
      throw err;
    } finally {
      if (inflight.get(guildId) === promise) inflight.delete(guildId);
    }
  }

  async function getDayImage(guildId: string, dayKey: string): Promise<Buffer | undefined> {
    const entry = entries.get(guildId);
    if (!entry) return undefined;
    const dayEvents = entry.timetable.eventsByDay.get(dayKey) ?? [];
    if (dayEvents.length === 0) return undefined;
    const cached = entry.images.get(dayKey);
    if (cached) return cached;
    try {
      const png = await deps.renderDay(entry.timetable, dayKey);
      entry.images.set(dayKey, png);
      return png;
    } catch (err) {
      console.error(`[Timetable] On-demand render failed for guild ${guildId} day ${dayKey}:`, err);
      return undefined;
    }
  }

  return { peek, selectDay, refresh, getDayImage, entries };
}
