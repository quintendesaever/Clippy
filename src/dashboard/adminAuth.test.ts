import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionFlagsBits, type Client } from "discord.js";
import type { NextFunction, Request, Response } from "express";
import {
  createRequireAdmin,
  memberHasAdminPermission,
  userIsGuildAdmin,
} from "./adminAuth.js";

describe("memberHasAdminPermission", () => {
  it("allows ManageGuild", () => {
    assert.equal(
      memberHasAdminPermission({
        has: (flag) => flag === PermissionFlagsBits.ManageGuild,
      }),
      true
    );
  });

  it("rejects members without ManageGuild", () => {
    assert.equal(memberHasAdminPermission({ has: () => false }), false);
    assert.equal(memberHasAdminPermission(null), false);
    assert.equal(memberHasAdminPermission(undefined), false);
  });
});

function mockClient(options: {
  guildMissing?: boolean;
  fetchThrows?: boolean;
  manageGuild?: boolean;
}): Client {
  if (options.guildMissing) {
    return { guilds: { cache: { get: () => undefined } } } as unknown as Client;
  }
  return {
    guilds: {
      cache: {
        get: () => ({
          members: {
            fetch: async () => {
              if (options.fetchThrows) throw new Error("member missing");
              return {
                permissions: {
                  has: (flag: bigint) =>
                    options.manageGuild === true && flag === PermissionFlagsBits.ManageGuild,
                },
              };
            },
          },
        }),
      },
    },
  } as unknown as Client;
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

async function invokeRequireAdmin(
  middleware: ReturnType<typeof createRequireAdmin>,
  req: Partial<Request>
) {
  const res = mockRes();
  let nextCalled = false;
  await new Promise<void>((resolve) => {
    const next: NextFunction = () => {
      nextCalled = true;
      resolve();
    };
    const json = res.json.bind(res);
    res.json = (payload: unknown) => {
      json(payload);
      resolve();
      return res;
    };
    middleware(req as Request, res as unknown as Response, next);
  });
  return { res, nextCalled };
}

describe("createRequireAdmin", () => {
  it("returns 401 when there is no session user", async () => {
    const requireAdmin = createRequireAdmin({
      getClient: () => mockClient({ manageGuild: true }),
      getGuildId: () => "guild",
      getSessionUser: () => undefined,
    });
    const { res, nextCalled } = await invokeRequireAdmin(requireAdmin, {});
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: "Not authenticated" });
  });

  it("returns 403 for an authenticated member without ManageGuild", async () => {
    const requireAdmin = createRequireAdmin({
      getClient: () => mockClient({ manageGuild: false }),
      getGuildId: () => "guild",
      getSessionUser: () => ({ id: "user-1" }),
    });
    const { res, nextCalled } = await invokeRequireAdmin(requireAdmin, {});
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Forbidden" });
  });

  it("calls next for an authenticated member with ManageGuild", async () => {
    const requireAdmin = createRequireAdmin({
      getClient: () => mockClient({ manageGuild: true }),
      getGuildId: () => "guild",
      getSessionUser: () => ({ id: "admin-1" }),
    });
    const { res, nextCalled } = await invokeRequireAdmin(requireAdmin, {});
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, undefined);
  });
});

describe("userIsGuildAdmin", () => {
  it("fails closed when the guild or member cannot be loaded", async () => {
    assert.equal(await userIsGuildAdmin(null, "guild", "user-1"), false);
    assert.equal(await userIsGuildAdmin(mockClient({ guildMissing: true }), "guild", "user-1"), false);
    assert.equal(await userIsGuildAdmin(mockClient({ fetchThrows: true }), "guild", "user-1"), false);
  });
});
