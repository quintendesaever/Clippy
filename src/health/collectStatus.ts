import type { Client } from "discord.js";
import { getStatusHistory, getStatusHistoryLimit, type StatusHistoryStore } from "./statusHistory.js";
import type {
  AdminStatusReport,
  ComponentReport,
  StatusReport,
  StatusRuntime,
  StatusSummary,
} from "./types.js";

export const DEFAULT_STATUS_CHECK_TIMEOUT_MS = 2000;

export type F1AdminSettings = {
  enabled: boolean;
  channel_id: string | null;
  role_id: string | null;
};

export type CollectStatusDeps = {
  getClient: () => Client | null;
  getGuildId: () => string;
  pingSupabase: () => Promise<void>;
  isF1ReminderJobRunning: () => boolean;
  isTimetablePanelJobRunning: () => boolean;
  now?: () => Date;
  getUptimeSeconds?: () => number;
  timeoutMs?: number;
  history?: Pick<StatusHistoryStore, "record" | "recent"> & { capacity?: number };
};

export type CollectAdminStatusDeps = CollectStatusDeps & {
  getF1ReminderSettings: (guildId: string) => Promise<F1AdminSettings | null>;
  isF1TestMode: () => boolean;
};

export function getStatusCheckTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.STATUS_CHECK_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_STATUS_CHECK_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_STATUS_CHECK_TIMEOUT_MS;
  return parsed;
}

export function createPingSupabase(client: {
  from: (table: string) => {
    select: (columns: string) => {
      limit: (count: number) => PromiseLike<{ error: { message?: string } | null }>;
    };
  };
}): () => Promise<void> {
  return async () => {
    const { error } = await client.from("guilds").select("guild_id").limit(1);
    if (error) throw new Error("probe failed");
  };
}

function reportDiscord(client: Client | null, guildId: string): ComponentReport {
  if (!client) {
    return { status: "unavailable", detail: "client not connected" };
  }
  let ready = false;
  try {
    ready = typeof client.isReady === "function" && client.isReady();
  } catch {
    ready = false;
  }
  if (!ready) {
    return { status: "unavailable", detail: "not ready" };
  }
  const guild = client.guilds?.cache?.get(guildId);
  if (!guild) {
    return { status: "degraded", detail: "guild not in cache" };
  }
  return { status: "ok" };
}

function reportJob(running: boolean): ComponentReport {
  return running ? { status: "ok" } : { status: "unavailable", detail: "not running" };
}

function withTimeout(work: Promise<void>, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      void work.catch(() => undefined);
      reject(new Error("timeout"));
    }, timeoutMs);
    work.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(Date.now() - startedAt));
}

async function reportSupabase(
  pingSupabase: () => Promise<void>,
  timeoutMs: number
): Promise<ComponentReport> {
  const startedAt = Date.now();
  try {
    await withTimeout(Promise.resolve().then(() => pingSupabase()), timeoutMs);
    return { status: "ok", latencyMs: elapsedMs(startedAt) };
  } catch (err) {
    const latencyMs = elapsedMs(startedAt);
    const message = err instanceof Error ? err.message : "probe failed";
    if (message === "timeout") {
      return { status: "unavailable", detail: "timeout", latencyMs };
    }
    return { status: "unavailable", detail: "probe failed", latencyMs };
  }
}

function rollupStatus(components: StatusReport["components"]): StatusReport["status"] {
  if (components.discord.status === "unavailable" || components.supabase.status === "unavailable") {
    return "unavailable";
  }
  const values = Object.values(components);
  if (values.some((component) => component.status !== "ok" && component.status !== "disabled")) {
    return "degraded";
  }
  return "ok";
}

export function summarizeComponents(components: StatusReport["components"]): StatusSummary {
  const summary: StatusSummary = { ok: 0, degraded: 0, unavailable: 0, disabled: 0 };
  for (const component of Object.values(components)) {
    summary[component.status] += 1;
  }
  return summary;
}

function historyCapacityOf(history?: CollectStatusDeps["history"]): number {
  const store = history ?? getStatusHistory();
  const capacity = store.capacity;
  if (typeof capacity === "number" && Number.isInteger(capacity) && capacity > 0) {
    return capacity;
  }
  return getStatusHistoryLimit();
}

function processStartedAt(checkedAt: string, uptimeSeconds: number): string {
  return new Date(Date.parse(checkedAt) - uptimeSeconds * 1000).toISOString();
}

export function buildStatusRuntime(
  report: Pick<StatusReport, "checkedAt" | "uptimeSeconds">,
  history?: CollectStatusDeps["history"]
): StatusRuntime {
  return {
    nodeEnv: process.env.NODE_ENV || "development",
    processStartedAt: processStartedAt(report.checkedAt, report.uptimeSeconds),
    historyCapacity: historyCapacityOf(history),
  };
}

export async function collectStatus(deps: CollectStatusDeps): Promise<StatusReport> {
  const timeoutMs = deps.timeoutMs ?? getStatusCheckTimeoutMs();
  const now = deps.now?.() ?? new Date();
  const uptimeSeconds = deps.getUptimeSeconds?.() ?? process.uptime();

  const discord = reportDiscord(deps.getClient(), deps.getGuildId());
  const supabase = await reportSupabase(deps.pingSupabase, timeoutMs);
  const components: StatusReport["components"] = {
    discord,
    supabase,
    dashboard: { status: "ok", detail: "listening" },
    f1ReminderJob: reportJob(deps.isF1ReminderJobRunning()),
    timetablePanelJob: reportJob(deps.isTimetablePanelJobRunning()),
  };

  const report: StatusReport = {
    status: rollupStatus(components),
    checkedAt: now.toISOString(),
    uptimeSeconds,
    components,
    summary: summarizeComponents(components),
  };
  (deps.history ?? getStatusHistory()).record(report);
  return report;
}

const SAFE_F1_ADMIN = {
  enabled: false,
  channelConfigured: false,
  roleConfigured: false,
  testMode: false,
} as const;

export async function collectAdminStatus(deps: CollectAdminStatusDeps): Promise<AdminStatusReport> {
  const report = await collectStatus(deps);
  const runtime = buildStatusRuntime(report, deps.history);
  try {
    const settings = await deps.getF1ReminderSettings(deps.getGuildId());
    return {
      ...report,
      admin: {
        f1: {
          enabled: settings?.enabled === true,
          channelConfigured: Boolean(settings?.channel_id),
          roleConfigured: Boolean(settings?.role_id),
          testMode: deps.isF1TestMode(),
        },
      },
      runtime,
    };
  } catch {
    return {
      ...report,
      admin: { f1: { ...SAFE_F1_ADMIN } },
      runtime,
    };
  }
}
