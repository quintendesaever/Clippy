import type { Client } from "discord.js";
import { applyLibraryTick } from "./panel.js";

export const LIBRARY_TICK_MS = 60 * 1000;

let intervalHandle: NodeJS.Timeout | null = null;

export function startLibraryJob(client: Client): void {
  if (intervalHandle) return;

  console.log(`library: job started (tick=${LIBRARY_TICK_MS}ms)`);
  void applyLibraryTick(client).catch((err) =>
    console.warn("library: startup reconcile failed", err instanceof Error ? err.message : err)
  );

  intervalHandle = setInterval(() => {
    void applyLibraryTick(client).catch((err) =>
      console.warn("library: tick failed", err instanceof Error ? err.message : err)
    );
  }, LIBRARY_TICK_MS);
}

export function isLibraryJobRunning(): boolean {
  return intervalHandle != null;
}
