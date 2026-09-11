import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { describe, it } from "node:test";
import express from "express";
import { PermissionFlagsBits, type Client } from "discord.js";
import type { AddressInfo } from "node:net";
import { createRequireAdmin } from "../dashboard/adminAuth.js";
import {
  collectAdminStatus,
  collectStatus,
  type CollectAdminStatusDeps,
} from "./collectStatus.js";
import type { AdminStatusReport, StatusReport } from "./types.js";

function mockAdminClient(manageGuild: boolean): Client {
  return {
    guilds: {
      cache: {
        get: () => ({
          members: {
            fetch: async () => ({
              permissions: {
                has: (flag: bigint) => manageGuild && flag === PermissionFlagsBits.ManageGuild,
              },
            }),
          },
        }),
      },
    },
  } as unknown as Client;
}

function mockDiscordReady(): Client {
  return {
    isReady: () => true,
    guilds: {
      cache: {
        get: (id: string) => (id === "guild-1" ? { id } : undefined),
      },
    },
  } as unknown as Client;
}

function okDeps(overrides: Partial<CollectAdminStatusDeps> = {}): CollectAdminStatusDeps {
  return {
    getClient: () => mockDiscordReady(),
    getGuildId: () => "guild-1",
    pingSupabase: async () => undefined,
    isF1ReminderJobRunning: () => true,
    isTimetablePanelJobRunning: () => true,
    now: () => new Date("2026-09-11T12:00:00.000Z"),
    getUptimeSeconds: () => 12,
    timeoutMs: 200,
    getF1ReminderSettings: async () => ({
      enabled: true,
      channel_id: "should-not-leak",
      role_id: "should-not-leak",
    }),
    isF1TestMode: () => false,
    ...overrides,
  };
}

function createStatusApp(options: {
  deps: CollectAdminStatusDeps;
  manageGuild: boolean;
  hasUser: boolean;
}) {
  const requireAdmin = createRequireAdmin({
    getClient: () => mockAdminClient(options.manageGuild),
    getGuildId: () => "guild",
    getSessionUser: () => (options.hasUser ? { id: "user-1" } : undefined),
  });
  const app = express();
  app.get("/api/status", async (req, res) => {
    const report = await collectStatus(options.deps);
    const ready = req.query.ready === "1" || req.query.ready === "true";
    if (ready && report.status === "unavailable") {
      res.status(503).json(report);
      return;
    }
    res.json(report);
  });
  app.get("/api/admin/status", requireAdmin, async (_req, res) => {
    const report = await collectAdminStatus(options.deps);
    res.json(report);
  });
  return app;
}

async function getJson(app: express.Express, path: string) {
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = (await res.json()) as StatusReport & Partial<AdminStatusReport> & { error?: string };
    return { status: res.status, body };
  } finally {
    server.close();
    await once(server, "close");
  }
}

describe("GET /api/status", () => {
  it("returns 200 and a StatusReport shape", async () => {
    const app = createStatusApp({ deps: okDeps(), manageGuild: true, hasUser: true });
    const { status, body } = await getJson(app, "/api/status");
    assert.equal(status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.checkedAt, "2026-09-11T12:00:00.000Z");
    assert.equal(body.uptimeSeconds, 12);
    assert.deepEqual(Object.keys(body.components).sort(), [
      "dashboard",
      "discord",
      "f1ReminderJob",
      "supabase",
      "timetablePanelJob",
    ]);
    assert.equal("admin" in body, false);
    assert.doesNotMatch(JSON.stringify(body), /should-not-leak|guild-1/);
  });

  it("returns 503 for ?ready=1 when the rollup is unavailable", async () => {
    const app = createStatusApp({
      deps: okDeps({ getClient: () => null }),
      manageGuild: true,
      hasUser: true,
    });
    const unavailable = await getJson(app, "/api/status?ready=1");
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.status, "unavailable");

    const asTrue = await getJson(app, "/api/status?ready=true");
    assert.equal(asTrue.status, 503);

    const withoutReady = await getJson(app, "/api/status");
    assert.equal(withoutReady.status, 200);
    assert.equal(withoutReady.body.status, "unavailable");
  });
});

describe("GET /api/admin/status", () => {
  it("returns 401 when there is no session", async () => {
    const app = createStatusApp({ deps: okDeps(), manageGuild: true, hasUser: false });
    const { status, body } = await getJson(app, "/api/admin/status");
    assert.equal(status, 401);
    assert.deepEqual(body, { error: "Not authenticated" });
  });

  it("returns 403 for an authenticated member without ManageGuild", async () => {
    const app = createStatusApp({ deps: okDeps(), manageGuild: false, hasUser: true });
    const { status, body } = await getJson(app, "/api/admin/status");
    assert.equal(status, 403);
    assert.deepEqual(body, { error: "Forbidden" });
  });

  it("allows ManageGuild and returns safe F1 admin fields", async () => {
    const app = createStatusApp({ deps: okDeps(), manageGuild: true, hasUser: true });
    const { status, body } = await getJson(app, "/api/admin/status");
    assert.equal(status, 200);
    assert.equal(body.status, "ok");
    assert.deepEqual(body.admin?.f1, {
      enabled: true,
      channelConfigured: true,
      roleConfigured: true,
      testMode: false,
    });
    assert.doesNotMatch(JSON.stringify(body), /should-not-leak/);
  });
});
