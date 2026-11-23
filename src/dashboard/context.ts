import type { Client } from "discord.js";
import type { RequestHandler } from "express";
import { supabase } from "../supabase.js";
import { getGuildId } from "../config.js";
import { isF1TestMode } from "../f1/config.js";
import { isF1ReminderJobRunning } from "../f1/job.js";
import { getF1ReminderSettings } from "../f1/reminderStorage.js";
import { isTimetablePanelJobRunning } from "../calendar/job.js";
import { createPingSupabase } from "../health/collectStatus.js";

export interface DashboardContext {
  getClient: () => Client | null;
  requireSession: RequestHandler;
  requireAdmin: RequestHandler;
  analyticsLimiter: RequestHandler;
  getGuildMemberDisplayName: (userId: string) => Promise<string | null>;
}

export function createStatusCollectorDeps(getClient: () => Client | null) {
  return {
    getClient,
    getGuildId,
    pingSupabase: createPingSupabase(supabase),
    isF1ReminderJobRunning,
    isTimetablePanelJobRunning,
    getF1ReminderSettings,
    isF1TestMode,
  };
}
