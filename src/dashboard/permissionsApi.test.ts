import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { describe, it } from "node:test";
import express from "express";
import { ChannelType, OverwriteType, PermissionFlagsBits, type Client, type Guild } from "discord.js";
import type { AddressInfo } from "node:net";
import { createRequireAdmin } from "./adminAuth.js";
import { createPermissionsRouter, GUILD_UNAVAILABLE_ERROR } from "./permissionsApi.js";

const GUILD_ID = "100000000000000001";
const ROLE_ID = "100000000000000002";
const TEXT_ID = "100000000000000003";
const USER_ID = "100000000000000004";
const BOT_ID = "100000000000000005";
const PIN_ROLE_ID = "1292583494551080980";
const OTHER_GUILD_ROLE = "200000000000000001";

function bitfield(value: bigint) {
  return { bitfield: value, has: (flag: bigint) => (value & flag) === flag };
}

function mockGuild(): Guild {
  const student = {
    id: ROLE_ID,
    name: "Student",
    position: 2,
    permissions: bitfield(PermissionFlagsBits.ViewChannel),
    managed: false,
    mentionable: true,
    editable: true,
    color: 0,
  };
  const pin = {
    id: PIN_ROLE_ID,
    name: "Indie",
    position: 3,
    permissions: bitfield(PermissionFlagsBits.PinMessages),
    managed: false,
    mentionable: false,
    editable: true,
    color: 0,
  };
  const everyone = {
    id: GUILD_ID,
    name: "@everyone",
    position: 0,
    permissions: bitfield(0n),
    managed: false,
    mentionable: false,
    editable: false,
    color: 0,
  };
  const text = {
    id: TEXT_ID,
    name: "general",
    type: ChannelType.GuildText,
    parentId: null,
    permissionsLocked: null,
    permissionOverwrites: {
      cache: new Map([
        [
          ROLE_ID,
          {
            id: ROLE_ID,
            type: OverwriteType.Role,
            allow: bitfield(PermissionFlagsBits.SendMessages),
            deny: bitfield(0n),
          },
        ],
      ]),
    },
    permissionsFor: (target: { id: string }) => ({
      has: (bit: bigint) =>
        target.id === USER_ID
          ? bit === PermissionFlagsBits.ViewChannel || bit === PermissionFlagsBits.SendMessages
          : bit === PermissionFlagsBits.ViewChannel,
    }),
  };
  const human = {
    id: USER_ID,
    displayName: "Ada",
    user: { username: "ada", bot: false },
    roles: { cache: new Map([[ROLE_ID, student]]) },
    permissions: bitfield(PermissionFlagsBits.ViewChannel),
    isCommunicationDisabled: () => false,
    communicationDisabledUntil: null,
  };
  const botMember = {
    id: BOT_ID,
    displayName: "Clippy",
    user: { username: "clippy", bot: true },
    roles: { highest: { position: 5, name: "Clippy" }, cache: new Map() },
    permissions: bitfield(0n),
    isCommunicationDisabled: () => false,
    communicationDisabledUntil: null,
  };
  const roles = new Map([
    [GUILD_ID, everyone],
    [ROLE_ID, student],
    [PIN_ROLE_ID, pin],
  ]);
  const channels = new Map([[TEXT_ID, text]]);
  const members = new Map([
    [USER_ID, human],
    [BOT_ID, botMember],
  ]);

  return {
    id: GUILD_ID,
    name: "Clippy Test",
    ownerId: USER_ID,
    roles: {
      fetch: async () => undefined,
      cache: {
        values: () => roles.values(),
        get: (id: string) => roles.get(id),
      },
    },
    channels: {
      fetch: async (id?: string) => (id ? (channels.get(id) ?? null) : undefined),
      cache: {
        values: () => channels.values(),
        get: (id: string) => channels.get(id),
      },
    },
    members: {
      me: botMember,
      fetchMe: async () => botMember,
      fetch: async (id?: string) => {
        if (typeof id === "string") {
          const member = members.get(id);
          if (!member) throw new Error("missing");
          return member;
        }
        return members;
      },
      cache: {
        values: () => members.values(),
        get: (id: string) => members.get(id),
      },
    },
  } as unknown as Guild;
}

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

function mockDataClient(guild: Guild | null): Client {
  return {
    guilds: {
      cache: {
        get: (id: string) => (id === GUILD_ID ? guild : undefined),
      },
    },
  } as unknown as Client;
}

function createApp(options: { manageGuild: boolean; hasUser: boolean; guild?: Guild | null }) {
  const requireAdmin = createRequireAdmin({
    getClient: () => mockAdminClient(options.manageGuild),
    getGuildId: () => GUILD_ID,
    getSessionUser: () => (options.hasUser ? { id: "admin-1" } : undefined),
  });
  const app = express();
  app.use(
    "/api/admin/permissions",
    requireAdmin,
    createPermissionsRouter({
      getClient: () => mockDataClient(options.guild === undefined ? mockGuild() : options.guild),
      getGuildId: () => GUILD_ID,
    })
  );
  return app;
}

async function requestJson(app: express.Express, path: string) {
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = (await res.json()) as Record<string, unknown>;
    return { status: res.status, body };
  } finally {
    server.close();
    await once(server, "close");
  }
}

describe("GET /api/admin/permissions auth", () => {
  it("returns 401 when there is no session", async () => {
    const { status, body } = await requestJson(createApp({ manageGuild: true, hasUser: false }), "/api/admin/permissions");
    assert.equal(status, 401);
    assert.deepEqual(body, { error: "Not authenticated" });
  });

  it("returns 403 for an authenticated member without ManageGuild", async () => {
    const { status, body } = await requestJson(createApp({ manageGuild: false, hasUser: true }), "/api/admin/permissions");
    assert.equal(status, 403);
    assert.deepEqual(body, { error: "Forbidden" });
  });
});

describe("GET /api/admin/permissions", () => {
  it("returns a bigint-safe overview for the server-derived guild", async () => {
    const { status, body } = await requestJson(
      createApp({ manageGuild: true, hasUser: true }),
      "/api/admin/permissions?guildId=someone-else"
    );
    assert.equal(status, 200);
    assert.equal((body.guild as { id: string }).id, GUILD_ID);
    assert.equal(body.writable, false);
    JSON.stringify(body);
  });

  it("returns 503 when the configured guild is unavailable", async () => {
    const { status, body } = await requestJson(
      createApp({ manageGuild: true, hasUser: true, guild: null }),
      "/api/admin/permissions"
    );
    assert.equal(status, 503);
    assert.deepEqual(body, { error: GUILD_UNAVAILABLE_ERROR });
  });
});

describe("permission inspector routes", () => {
  it("rejects invalid and unknown ids without leaking another guild", async () => {
    const app = createApp({ manageGuild: true, hasUser: true });
    const badRole = await requestJson(app, "/api/admin/permissions/roles/not-an-id");
    assert.equal(badRole.status, 400);
    const missingRole = await requestJson(app, `/api/admin/permissions/roles/${OTHER_GUILD_ROLE}`);
    assert.equal(missingRole.status, 404);
    const missingChannel = await requestJson(app, `/api/admin/permissions/channels/${OTHER_GUILD_ROLE}`);
    assert.equal(missingChannel.status, 404);
    const missingMember = await requestJson(
      app,
      `/api/admin/permissions/members/${OTHER_GUILD_ROLE}?channelId=${TEXT_ID}`
    );
    assert.equal(missingMember.status, 404);
    const missingChannelQuery = await requestJson(app, `/api/admin/permissions/members/${USER_ID}`);
    assert.equal(missingChannelQuery.status, 400);
  });

  it("inspects role, channel, and member from the configured guild", async () => {
    const app = createApp({ manageGuild: true, hasUser: true });
    const role = await requestJson(app, `/api/admin/permissions/roles/${ROLE_ID}`);
    assert.equal(role.status, 200);
    assert.equal(role.body.id, ROLE_ID);
    assert.equal(role.body.omittedOverrides, 0);

    const channel = await requestJson(app, `/api/admin/permissions/channels/${TEXT_ID}`);
    assert.equal(channel.status, 200);
    assert.equal(channel.body.id, TEXT_ID);
    assert.ok(Array.isArray(channel.body.overwrites));

    const member = await requestJson(app, `/api/admin/permissions/members/${USER_ID}?channelId=${TEXT_ID}`);
    assert.equal(member.status, 200);
    assert.equal(member.body.userId, USER_ID);
    assert.equal(member.body.computed, true);
    assert.equal(member.body.owner, true);
  });
});
