import {
  addCalendarDays,
  dayKeyInTimezone,
  getWeekDayKeys,
  getWeekMondayKey,
} from "../../shared/timetable/dates.js";
import { collectAvatarUserIds } from "./timetableCardLayout.js";
import {
  hashGuildTimetable,
  isDayOverrideActive,
  needsNextWeekForActiveDay,
  resolveSelectedDay,
  TIMETABLE_DAY_OVERRIDE_MS,
} from "./timetableHash.js";
import type { GuildTimetable } from "./types.js";

export const TIMETABLE_VALIDATE_INTERVAL_MS = 20 * 60 * 1000;

export type FetchTimetableOptions = {
  skipIcsCache?: boolean;
  weekMonday?: string;
};

export type WeekCacheEntry = {
  weekMonday: string;
  calendarDayKey: string;
  selectedDayKey: string;
  /** Epoch ms when a Discord day-button override expires. Restart/expiry → auto. */
  dayOverrideUntil?: number;
  dataHash: string;
  validatedAt: number;
  lastFetchAttemptAt: number;
  timetable: GuildTimetable;
  images: Map<string, Buffer>;
};

export type TimeoutHandle = {
  unref?: () => void;
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
  setTimeout?: (callback: () => void | Promise<void>, delayMs: number) => TimeoutHandle;
  clearTimeout?: (handle: TimeoutHandle) => void;
  onOverrideExpired?: (guildId: string) => void | Promise<void>;
};

export type RefreshCacheOptions = {
  force?: boolean;
  skipIcsCache?: boolean;
  preferToday?: boolean;
  selectedDayKey?: string;
  /** Drop an in-memory day override (e.g. /timetable force refresh). */
  clearDayOverride?: boolean;
};

export function daysWithEvents(timetable: GuildTimetable): string[] {
  return [...timetable.eventsByDay.entries()]
    .filter(([, events]) => events.length > 0)
    .map(([dayKey]) => dayKey)
    .sort((a, b) => a.localeCompare(b));
}

function applyAutoSelectedDay(
  entry: WeekCacheEntry,
  todayKey: string,
  now: number
): void {
  entry.calendarDayKey = todayKey;
  entry.selectedDayKey = resolveSelectedDay({
    todayKey,
    weekKeys: getWeekDayKeys(entry.weekMonday),
    previouslySelected: entry.selectedDayKey,
    preferToday: true,
    busyDayKeys: daysWithEvents(entry.timetable),
    now,
    overrideUntil: entry.dayOverrideUntil,
  });
  if (!isDayOverrideActive(entry.dayOverrideUntil, now)) {
    entry.dayOverrideUntil = undefined;
  }
}

export function createTimetableWeekCache(deps: TimetableWeekCacheDeps) {
  const entries = new Map<string, WeekCacheEntry>();
  const inflight = new Map<string, Promise<WeekCacheEntry>>();
  const overrideTimers = new Map<string, TimeoutHandle>();
  let onOverrideExpired = deps.onOverrideExpired;

  const log = (message: string) => {
    (deps.log ?? ((line: string) => console.log(line)))(message);
  };

  const scheduleTimeout = deps.setTimeout ?? ((callback: () => void | Promise<void>, delayMs: number) => {
    const handle = setTimeout(() => {
      void callback();
    }, delayMs);
    handle.unref?.();
    return handle;
  });
  const cancelTimeout = deps.clearTimeout ?? ((handle: TimeoutHandle) => {
    clearTimeout(handle as NodeJS.Timeout);
  });

  function peek(guildId: string): WeekCacheEntry | undefined {
    return entries.get(guildId);
  }

  function setOnOverrideExpired(
    handler: ((guildId: string) => void | Promise<void>) | undefined
  ): void {
    onOverrideExpired = handler;
  }

  function cancelOverrideTimer(guildId: string): boolean {
    const handle = overrideTimers.get(guildId);
    if (!handle) return false;
    cancelTimeout(handle);
    overrideTimers.delete(guildId);
    return true;
  }

  function clearOverrideTimers(): void {
    for (const guildId of [...overrideTimers.keys()]) {
      cancelOverrideTimer(guildId);
    }
  }

  function scheduleOverrideTimer(guildId: string, until: number): void {
    cancelOverrideTimer(guildId);
    const delay = Math.max(0, until - deps.now());
    const handle = scheduleTimeout(() => onOverrideTimerFired(guildId), delay);
    handle.unref?.();
    overrideTimers.set(guildId, handle);
  }

  async function onOverrideTimerFired(guildId: string): Promise<void> {
    overrideTimers.delete(guildId);
    const entry = entries.get(guildId);
    if (!entry) return;
    if (isDayOverrideActive(entry.dayOverrideUntil, deps.now())) return;

    const fromDay = entry.selectedDayKey;
    await refresh(guildId, { preferToday: true });

    const after = entries.get(guildId);
    if (!after || isDayOverrideActive(after.dayOverrideUntil, deps.now())) return;

    log(`[Timetable] Day override expired for guild ${guildId} (${fromDay} → ${after.selectedDayKey})`);
    try {
      await onOverrideExpired?.(guildId);
    } catch (err) {
      console.error(`[Timetable] Day override expiry handler failed for guild ${guildId}:`, err);
    }
  }

  function selectDay(guildId: string, dayKey: string): WeekCacheEntry | null {
    const entry = entries.get(guildId);
    if (!entry) return null;
    const weekKeys = getWeekDayKeys(entry.weekMonday);
    if (!weekKeys.includes(dayKey)) return null;
    entry.selectedDayKey = dayKey;
    entry.dayOverrideUntil = deps.now() + TIMETABLE_DAY_OVERRIDE_MS;
    scheduleOverrideTimer(guildId, entry.dayOverrideUntil);
    log(`[Timetable] Day override set for guild ${guildId} → ${dayKey}`);
    return entry;
  }

  function disarmDayOverride(guildId: string, reason: string): void {
    const entry = entries.get(guildId);
    const hadOverride = entry?.dayOverrideUntil != null || overrideTimers.has(guildId);
    cancelOverrideTimer(guildId);
    if (entry) entry.dayOverrideUntil = undefined;
    if (hadOverride) {
      log(`[Timetable] Day override cancelled for guild ${guildId} (${reason})`);
    }
  }

  async function rebuild(
    guildId: string,
    previous: WeekCacheEntry | undefined,
    options: RefreshCacheOptions
  ): Promise<WeekCacheEntry> {
    const fetchOpts = { skipIcsCache: options.skipIcsCache };
    let timetable = await deps.fetchTimetable(guildId, fetchOpts);
    let weekMonday = getWeekMondayKey(timetable.rangeStart, timetable.guildTimezone);
    const now = deps.now();
    const todayKey = dayKeyInTimezone(new Date(now), timetable.guildTimezone);
    const startingOverride = Boolean(options.selectedDayKey);
    const dropOverride = Boolean(options.clearDayOverride) && !startingOverride;
    const overrideUntil = startingOverride
      ? now + TIMETABLE_DAY_OVERRIDE_MS
      : dropOverride
        ? undefined
        : previous?.dayOverrideUntil;
    const autoSelect = !isDayOverrideActive(overrideUntil, now);

    let busyDayKeys = daysWithEvents(timetable);
    const memberCount = timetable.members.length;
    const memberErrors = timetable.members.filter((member) => member.error).length;
    // Avoid a second full ICS stampede when most calendars already failed to load.
    const majorityIcsFailed = memberCount > 0 && memberErrors * 2 >= memberCount;
    if (autoSelect && !majorityIcsFailed && needsNextWeekForActiveDay(todayKey, busyDayKeys)) {
      const nextMonday = addCalendarDays(weekMonday, 7);
      const nextWeek = await deps.fetchTimetable(guildId, {
        ...fetchOpts,
        weekMonday: nextMonday,
      });
      const nextBusy = daysWithEvents(nextWeek);
      if (!needsNextWeekForActiveDay(todayKey, nextBusy)) {
        timetable = nextWeek;
        weekMonday = getWeekMondayKey(nextWeek.rangeStart, nextWeek.guildTimezone);
        busyDayKeys = nextBusy;
        log(`[Timetable] Skipping empty remainder of week; loading ${weekMonday} for guild ${guildId}`);
      }
    }

    const weekKeys = getWeekDayKeys(weekMonday);
    const dataHash = hashGuildTimetable(timetable, deps.rendererVersion);
    const previouslySelected = options.selectedDayKey ?? previous?.selectedDayKey;
    const selectedDayKey = resolveSelectedDay({
      todayKey,
      weekKeys,
      previouslySelected,
      preferToday: options.preferToday ?? false,
      busyDayKeys,
      now,
      overrideUntil,
    });
    const overrideKept =
      isDayOverrideActive(overrideUntil, now) && selectedDayKey === previouslySelected;
    const dayOverrideUntil = overrideKept ? overrideUntil : undefined;

    if (previous && previous.weekMonday === weekMonday && previous.dataHash === dataHash) {
      previous.timetable = timetable;
      previous.validatedAt = now;
      previous.lastFetchAttemptAt = now;
      previous.calendarDayKey = todayKey;
      previous.selectedDayKey = selectedDayKey;
      previous.dayOverrideUntil = dayOverrideUntil;
      log(`[Timetable] Cache valid for guild ${guildId}`);
      if (startingOverride && options.selectedDayKey && weekKeys.includes(options.selectedDayKey)) {
        selectDay(guildId, options.selectedDayKey);
      } else if (!isDayOverrideActive(previous.dayOverrideUntil, now)) {
        cancelOverrideTimer(guildId);
        previous.dayOverrideUntil = undefined;
      }
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
    const userIds = collectAvatarUserIds(timetable.events);
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
      dayOverrideUntil,
      dataHash,
      validatedAt: now,
      lastFetchAttemptAt: now,
      timetable,
      images,
    };
    entries.set(guildId, entry);
    if (startingOverride && options.selectedDayKey && weekKeys.includes(options.selectedDayKey)) {
      selectDay(guildId, options.selectedDayKey);
    } else if (!isDayOverrideActive(entry.dayOverrideUntil, now)) {
      cancelOverrideTimer(guildId);
      entry.dayOverrideUntil = undefined;
    }
    return entry;
  }

  function isFreshForCurrentWeek(entry: WeekCacheEntry): boolean {
    const weekMonday = getWeekMondayKey(new Date(deps.now()), entry.timetable.guildTimezone);
    // Cache may intentionally hold next week when current week is empty from today onward.
    if (entry.weekMonday !== weekMonday && entry.weekMonday !== addCalendarDays(weekMonday, 7)) {
      return false;
    }
    return deps.now() - entry.validatedAt < deps.validateIntervalMs;
  }

  async function refresh(guildId: string, options: RefreshCacheOptions = {}): Promise<WeekCacheEntry> {
    if (options.clearDayOverride && !options.selectedDayKey) {
      disarmDayOverride(guildId, "force refresh");
    }

    function tryHotPath(entry: WeekCacheEntry): WeekCacheEntry | null {
      if (options.force || options.skipIcsCache || !isFreshForCurrentWeek(entry)) return null;
      const now = deps.now();
      const todayKey = dayKeyInTimezone(new Date(now), entry.timetable.guildTimezone);
      const overrideActive = isDayOverrideActive(entry.dayOverrideUntil, now);

      if (options.selectedDayKey) {
        selectDay(guildId, options.selectedDayKey);
        return entry;
      }

      if (overrideActive) {
        entry.calendarDayKey = todayKey;
        return entry;
      }

      if (needsNextWeekForActiveDay(todayKey, daysWithEvents(entry.timetable))) return null;
      applyAutoSelectedDay(entry, todayKey, now);
      cancelOverrideTimer(guildId);
      return entry;
    }

    const pending = inflight.get(guildId);
    if (pending) {
      const inFlightEntry = await pending;
      const hot = tryHotPath(inFlightEntry);
      if (hot) return hot;
    }

    const existing = entries.get(guildId);
    if (existing) {
      const hot = tryHotPath(existing);
      if (hot) return hot;
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

  return {
    peek,
    selectDay,
    refresh,
    getDayImage,
    entries,
    setOnOverrideExpired,
    clearOverrideTimers,
  };
}
