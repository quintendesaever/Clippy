import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { describe, it } from "node:test";
import express from "express";
import { PermissionFlagsBits, type Client } from "discord.js";
import type { AddressInfo } from "node:net";
import { createRequireAdmin } from "./adminAuth.js";
import { parseAdminRangePreset } from "./adminStatsAggregate.js";

function mockClient(manageGuild: boolean): Client {
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

function createDiscordStatsApp(options: { manageGuild: boolean; hasUser: boolean }) {
  const requireAdmin = createRequireAdmin({
    getClient: () => mockClient(options.manageGuild),
    getGuildId: () => "guild",
    getSessionUser: () => (options.hasUser ? { id: "user-1" } : undefined),
  });
  const app = express();
  app.get("/api/admin/discord/stats", requireAdmin, (req, res) => {
    res.json({ range: parseAdminRangePreset(req.query.range), ok: true });
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
    const body = (await res.json()) as { error?: string; range?: string; ok?: boolean };
    return { status: res.status, body };
  } finally {
    server.close();
    await once(server, "close");
  }
}

describe("GET /api/admin/discord/stats", () => {
  it("returns 401 when there is no session", async () => {
    const app = createDiscordStatsApp({ manageGuild: true, hasUser: false });
    const { status, body } = await getJson(app, "/api/admin/discord/stats?range=7d");
    assert.equal(status, 401);
    assert.deepEqual(body, { error: "Not authenticated" });
  });

  it("returns 403 for an authenticated member without ManageGuild", async () => {
    const app = createDiscordStatsApp({ manageGuild: false, hasUser: true });
    const { status, body } = await getJson(app, "/api/admin/discord/stats?range=7d");
    assert.equal(status, 403);
    assert.deepEqual(body, { error: "Forbidden" });
  });

  it("allows ManageGuild and validates the date range", async () => {
    const app = createDiscordStatsApp({ manageGuild: true, hasUser: true });
    const allowed = await getJson(app, "/api/admin/discord/stats?range=30d");
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.range, "30d");

    const invalid = await getJson(app, "/api/admin/discord/stats?range=yesterday");
    assert.equal(invalid.status, 200);
    assert.equal(invalid.body.range, "7d");
  });
});
