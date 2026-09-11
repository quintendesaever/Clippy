import type { Client } from "discord.js";
import type { AdminStatusReport, ComponentReport, StatusReport } from "./types.js";

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

async function reportSupabase(
  pingSupabase: () => Promise<void>,
  timeoutMs: number
): Promise<ComponentReport> {
  try {
    await withTimeout(Promise.resolve().then(() => pingSupabase()), timeoutMs);
    return { status: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "probe failed";
    if (message === "timeout") {
      return { status: "unavailable", detail: "timeout" };
    }
    return { status: "unavailable", detail: "probe failed" };
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

  return {
    status: rollupStatus(components),
    checkedAt: now.toISOString(),
    uptimeSeconds,
    components,
  };
}

const SAFE_F1_ADMIN = {
  enabled: false,
  channelConfigured: false,
  roleConfigured: false,
  testMode: false,
} as const;

export async function collectAdminStatus(deps: CollectAdminStatusDeps): Promise<AdminStatusReport> {
  const report = await collectStatus(deps);
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
    };
  } catch {
    return {
      ...report,
      admin: { f1: { ...SAFE_F1_ADMIN } },
    };
  }
}
