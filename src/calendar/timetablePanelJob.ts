import type { Client } from "discord.js";
import { applyDayOverrideExpiry, applyTimetablePanelTick } from "./timetablePanel.js";
import { timetableWeekCache } from "./timetableWeekCacheLive.js";

export const TIMETABLE_PANEL_TICK_MS = 60 * 1000;

let intervalHandle: NodeJS.Timeout | null = null;

export function startTimetablePanelJob(client: Client): void {
  timetableWeekCache.setOnOverrideExpired((guildId) => applyDayOverrideExpiry(client, guildId));

  if (intervalHandle) return;

  console.log(`[Timetable] Panel job started (tick=${TIMETABLE_PANEL_TICK_MS}ms)`);
  void applyTimetablePanelTick(client, { startup: true }).catch((err) =>
    console.error("[Timetable] Startup recover failed:", err)
  );

  intervalHandle = setInterval(() => {
    void applyTimetablePanelTick(client).catch((err) =>
      console.error("[Timetable] Panel tick failed:", err)
    );
  }, TIMETABLE_PANEL_TICK_MS);
}

export function stopTimetablePanelJob(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  timetableWeekCache.clearOverrideTimers();
}

export function isTimetablePanelJobRunning(): boolean {
  return intervalHandle != null;
}
