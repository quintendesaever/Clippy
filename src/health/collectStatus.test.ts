import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Client } from "discord.js";
import {
  collectAdminStatus,
  collectStatus,
  createPingSupabase,
  getStatusCheckTimeoutMs,
  type CollectAdminStatusDeps,
  type CollectStatusDeps,
} from "./collectStatus.js";
import { StatusHistory } from "./statusHistory.js";

function mockDiscord(options: { ready?: boolean; hasGuild?: boolean } = {}): Client {
  const ready = options.ready !== false;
  const hasGuild = options.hasGuild !== false;
  return {
    isReady: () => ready,
    guilds: {
      cache: {
        get: (id: string) => (hasGuild && id === "guild-1" ? { id } : undefined),
      },
    },
  } as unknown as Client;
}

function okDeps(overrides: Partial<CollectStatusDeps> = {}): CollectStatusDeps {
  return {
    getClient: () => mockDiscord(),
    getGuildId: () => "guild-1",
    pingSupabase: async () => undefined,
    isF1ReminderJobRunning: () => true,
    isTimetablePanelJobRunning: () => true,
    now: () => new Date("2026-09-11T12:00:00.000Z"),
    getUptimeSeconds: () => 42,
    timeoutMs: 200,
    history: { record() {}, recent: () => [] },
    ...overrides,
  };
}

function adminDeps(overrides: Partial<CollectAdminStatusDeps> = {}): CollectAdminStatusDeps {
  return {
    ...okDeps(),
    getF1ReminderSettings: async () => ({
      enabled: true,
      channel_id: "channel-1",
      role_id: "role-1",
    }),
    isF1TestMode: () => false,
    ...overrides,
  };
}

describe("collectStatus", () => {
  it("rolls up ok when every component is healthy", async () => {
    const report = await collectStatus(okDeps());
    assert.equal(report.status, "ok");
    assert.equal(report.checkedAt, "2026-09-11T12:00:00.000Z");
    assert.equal(report.uptimeSeconds, 42);
    assert.equal(report.components.discord.status, "ok");
    assert.equal(report.components.supabase.status, "ok");
    assert.equal(report.components.dashboard.status, "ok");
    assert.equal(report.components.f1ReminderJob.status, "ok");
    assert.equal(report.components.timetablePanelJob.status, "ok");
  });

  it("marks discord unavailable and rolls up unavailable when the client is not ready", async () => {
    const report = await collectStatus(
      okDeps({ getClient: () => mockDiscord({ ready: false }) })
    );
    assert.equal(report.components.discord.status, "unavailable");
    assert.equal(report.status, "unavailable");
  });

  it("marks discord unavailable when the client is missing", async () => {
    const report = await collectStatus(okDeps({ getClient: () => null }));
    assert.equal(report.components.discord.status, "unavailable");
    assert.equal(report.status, "unavailable");
  });

  it("marks discord degraded and rolls up degraded when the guild is missing from cache", async () => {
    const report = await collectStatus(
      okDeps({ getClient: () => mockDiscord({ hasGuild: false }) })
    );
    assert.equal(report.components.discord.status, "degraded");
    assert.equal(report.components.discord.detail, "guild not in cache");
    assert.equal(report.status, "degraded");
  });

  it("marks supabase unavailable and rolls up unavailable when the probe fails", async () => {
    const report = await collectStatus(
      okDeps({
        pingSupabase: async () => {
          throw new Error("connection refused");
        },
      })
    );
    assert.equal(report.components.supabase.status, "unavailable");
    assert.equal(report.components.supabase.detail, "probe failed");
    assert.equal(report.status, "unavailable");
  });

  it("does not throw when supabase times out and rolls up unavailable", async () => {
    const report = await collectStatus(
      okDeps({
        timeoutMs: 25,
        pingSupabase: () => new Promise(() => undefined),
      })
    );
    assert.equal(report.components.supabase.status, "unavailable");
    assert.equal(report.components.supabase.detail, "timeout");
    assert.equal(report.status, "unavailable");
  });

  it("respects the supabase probe timeout", async () => {
    const started = Date.now();
    const report = await collectStatus(
      okDeps({
        timeoutMs: 40,
        pingSupabase: () => new Promise(() => undefined),
      })
    );
    const elapsed = Date.now() - started;
    assert.equal(report.components.supabase.detail, "timeout");
    assert.ok(elapsed >= 40);
    assert.ok(elapsed < 1000);
  });

  it("rolls up degraded when jobs are stopped but discord and supabase are ok", async () => {
    const report = await collectStatus(
      okDeps({
        isF1ReminderJobRunning: () => false,
        isTimetablePanelJobRunning: () => false,
      })
    );
    assert.equal(report.components.f1ReminderJob.status, "unavailable");
    assert.equal(report.components.timetablePanelJob.status, "unavailable");
    assert.equal(report.components.discord.status, "ok");
    assert.equal(report.components.supabase.status, "ok");
    assert.equal(report.status, "degraded");
  });

  it("records the built StatusReport into the history store", async () => {
    const history = new StatusHistory(5);
    const report = await collectStatus(okDeps({ history }));
    assert.equal(history.recent().length, 1);
    assert.equal(history.recent()[0]?.checkedAt, report.checkedAt);
    assert.deepEqual(history.prior(), []);
  });
});

describe("collectAdminStatus", () => {
  it("adds safe F1 admin flags from settings", async () => {
    const report = await collectAdminStatus(
      adminDeps({
        getF1ReminderSettings: async () => ({
          enabled: true,
          channel_id: "channel-1",
          role_id: null,
        }),
        isF1TestMode: () => true,
      })
    );
    assert.equal(report.status, "ok");
    assert.deepEqual(report.admin.f1, {
      enabled: true,
      channelConfigured: true,
      roleConfigured: false,
      testMode: true,
    });
    assert.equal("channel_id" in report.admin.f1, false);
    assert.equal("role_id" in report.admin.f1, false);
  });

  it("uses false F1 admin defaults when settings fetch fails", async () => {
    const report = await collectAdminStatus(
      adminDeps({
        getF1ReminderSettings: async () => {
          throw new Error("db down");
        },
        isF1TestMode: () => true,
      })
    );
    assert.deepEqual(report.admin.f1, {
      enabled: false,
      channelConfigured: false,
      roleConfigured: false,
      testMode: false,
    });
  });

  it("records a single public snapshot through collectStatus", async () => {
    const history = new StatusHistory(5);
    const report = await collectAdminStatus(adminDeps({ history }));
    assert.equal(history.recent().length, 1);
    assert.equal(history.prior().length, 0);
    assert.equal("admin" in history.recent()[0]!, false);
    assert.equal(report.admin.f1.enabled, true);
  });
});

describe("getStatusCheckTimeoutMs", () => {
  it("defaults to 2000 and ignores invalid values", () => {
    assert.equal(getStatusCheckTimeoutMs({}), 2000);
    assert.equal(getStatusCheckTimeoutMs({ STATUS_CHECK_TIMEOUT_MS: "1500" }), 1500);
    assert.equal(getStatusCheckTimeoutMs({ STATUS_CHECK_TIMEOUT_MS: "0" }), 2000);
    assert.equal(getStatusCheckTimeoutMs({ STATUS_CHECK_TIMEOUT_MS: "nope" }), 2000);
  });
});

describe("createPingSupabase", () => {
  it("resolves when the lightweight query succeeds", async () => {
    const ping = createPingSupabase({
      from: () => ({
        select: () => ({
          limit: async () => ({ error: null }),
        }),
      }),
    });
    await ping();
  });

  it("throws a generic error when the query fails", async () => {
    const ping = createPingSupabase({
      from: () => ({
        select: () => ({
          limit: async () => ({ error: { message: "secret connection string" } }),
        }),
      }),
    });
    await assert.rejects(ping, /probe failed/);
  });
});
