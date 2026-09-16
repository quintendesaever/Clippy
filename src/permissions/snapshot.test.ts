import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelType, PermissionFlagsBits, type Guild } from "discord.js";
import { inspectChannel, inspectRole } from "./inspect.js";
import { toChannelInspectionDto } from "./dto.js";
import {
  buildGuildSnapshot,
  inspectGuildMember,
  inspectRoleEffectiveInChannel,
  loadMemberCatalog,
  MAX_CHANNEL_ROLE_MATRIX,
  resolveInspectableChannel,
} from "./snapshot.js";

const GUILD_ID = "100000000000000001";
const ROLE_ID = "100000000000000002";
const TEXT_ID = "100000000000000003";
const CATEGORY_ID = "100000000000000006";
const USER_ID = "100000000000000004";
const BOT_ID = "100000000000000005";
const FOREIGN_ID = "199999999999999999";

function bitfield(value: bigint) {
  return { bitfield: value, has: (flag: bigint) => (value & flag) === flag };
}

function mockGuild(options: {
  rolesFail?: boolean;
  channelsFail?: boolean;
  membersFail?: boolean;
  botResolved?: boolean;
} = {}): Guild {
  const everyone = {
    id: GUILD_ID,
    name: "@everyone",
    position: 0,
    permissions: bitfield(0n),
    managed: false,
    mentionable: false,
    editable: true,
    color: 0,
  };
  const student = {
    id: ROLE_ID,
    name: "Student",
    position: 2,
    permissions: bitfield(PermissionFlagsBits.ViewChannel),
    managed: false,
    mentionable: true,
    editable: true,
    color: 0x3366ff,
  };
  const botRole = {
    id: "100000000000000007",
    name: "Clippy",
    position: 8,
    permissions: bitfield(0n),
    managed: true,
    mentionable: false,
    editable: false,
    color: 0,
  };

  const category = {
    id: CATEGORY_ID,
    name: "courses",
    type: ChannelType.GuildCategory,
    parentId: null,
    permissionsLocked: null,
    permissionOverwrites: {
      cache: new Map([
        [
          GUILD_ID,
          {
            id: GUILD_ID,
            type: 0,
            allow: bitfield(0n),
            deny: bitfield(PermissionFlagsBits.ViewChannel),
          },
        ],
      ]),
    },
  };
  const text = {
    id: TEXT_ID,
    name: "general",
    type: ChannelType.GuildText,
    parentId: CATEGORY_ID,
    permissionsLocked: false,
    permissionOverwrites: {
      cache: new Map([
        [
          ROLE_ID,
          {
            id: ROLE_ID,
            type: 0,
            allow: bitfield(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages),
            deny: bitfield(0n),
          },
        ],
      ]),
    },
    permissionsFor: (target: { id: string }) => {
      if (target.id === USER_ID || target.id === BOT_ID || target.id === ROLE_ID) {
        return {
          has: (bit: bigint) =>
            bit === PermissionFlagsBits.ViewChannel || bit === PermissionFlagsBits.SendMessages,
        };
      }
      return {
        has: (bit: bigint) => bit === PermissionFlagsBits.ViewChannel,
      };
    },
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
    roles: { highest: { position: 8, name: "Clippy" }, cache: new Map() },
    permissions: bitfield(0n),
    isCommunicationDisabled: () => false,
    communicationDisabledUntil: null,
  };

  const roles = new Map([
    [GUILD_ID, everyone],
    [ROLE_ID, student],
    [botRole.id, botRole],
  ]);
  const channels = new Map([
    [CATEGORY_ID, category],
    [TEXT_ID, text],
  ]);
  const members = new Map([
    [USER_ID, human],
    [BOT_ID, botMember],
  ]);

  return {
    id: GUILD_ID,
    name: "Clippy Test",
    ownerId: USER_ID,
    roles: {
      fetch: async () => {
        if (options.rolesFail) throw new Error("roles boom");
      },
      cache: {
        values: () => roles.values(),
        get: (id: string) => roles.get(id),
      },
    },
    channels: {
      fetch: async (id?: string) => {
        if (options.channelsFail) throw new Error("channels boom");
        if (id) return channels.get(id) ?? null;
      },
      cache: {
        values: () => channels.values(),
        get: (id: string) => channels.get(id),
      },
    },
    members: {
      me: options.botResolved === false ? null : botMember,
      fetchMe: async () => {
        if (options.botResolved === false) throw new Error("no me");
        return botMember;
      },
      fetch: async (id?: string) => {
        if (options.membersFail) throw new Error("members boom");
        if (typeof id === "string") {
          const member = members.get(id);
          if (!member) throw new Error("unknown member");
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

describe("buildGuildSnapshot", () => {
  it("maps live guild roles and inspectable channels", async () => {
    const snapshot = await buildGuildSnapshot(mockGuild());
    assert.equal(snapshot.id, GUILD_ID);
    assert.equal(snapshot.name, "Clippy Test");
    assert.equal(snapshot.rolesFetchIncomplete, false);
    assert.equal(snapshot.channelsFetchIncomplete, false);
    assert.equal(snapshot.bot.resolved, true);
    assert.equal(snapshot.bot.highestRoleName, "Clippy");
    assert.ok(snapshot.roles.some((role) => role.id === ROLE_ID && role.permissions === PermissionFlagsBits.ViewChannel));
    assert.ok(snapshot.channels.some((channel) => channel.id === TEXT_ID && channel.parentId === CATEGORY_ID));
    const inspection = inspectRole(snapshot, ROLE_ID);
    assert.ok(inspection);
    assert.equal(inspection!.explicitPermissions.some((entry) => entry.granted), true);
  });

  it("marks incomplete fetches without throwing", async () => {
    const snapshot = await buildGuildSnapshot(mockGuild({ rolesFail: true, channelsFail: true }));
    assert.equal(snapshot.rolesFetchIncomplete, true);
    assert.equal(snapshot.channelsFetchIncomplete, true);
    assert.ok(snapshot.roles.length > 0);
    assert.ok(snapshot.channels.length > 0);
  });
});

describe("loadMemberCatalog", () => {
  it("excludes bots and can flag an incomplete fetch", async () => {
    const ok = await loadMemberCatalog(mockGuild());
    assert.deepEqual(
      ok.members.map((member) => member.id),
      [USER_ID]
    );
    assert.equal(ok.membersFetchIncomplete, false);

    const incomplete = await loadMemberCatalog(mockGuild({ membersFail: true }));
    assert.equal(incomplete.membersFetchIncomplete, true);
    assert.equal(incomplete.members[0]?.id, USER_ID);
  });
});

describe("resolveInspectableChannel", () => {
  it("accepts text and category channels from the configured guild only", async () => {
    const guild = mockGuild();
    const text = await resolveInspectableChannel(guild, TEXT_ID);
    assert.equal(text.ok, true);
    const missing = await resolveInspectableChannel(guild, FOREIGN_ID);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.match(missing.message, /could not find/i);
  });
});

describe("inspectGuildMember", () => {
  it("uses permissionsFor and reports owner/admin/timeout notes separately", async () => {
    const guild = mockGuild();
    const channel = (guild.channels.cache.get(TEXT_ID) ?? null) as never;
    const inspection = await inspectGuildMember(guild, USER_ID, channel);
    assert.ok(!("error" in inspection));
    if ("error" in inspection) return;
    assert.equal(inspection.computed, true);
    assert.equal(inspection.owner, true);
    assert.equal(inspection.administrator, false);
    assert.equal(inspection.timedOut, false);
    assert.ok(inspection.effective.some((entry) => entry.bit === PermissionFlagsBits.ViewChannel && entry.allowed));
    assert.ok(inspection.effective.some((entry) => entry.bit === PermissionFlagsBits.SendMessages && entry.allowed));
    assert.ok(inspection.effective.some((entry) => entry.bit === PermissionFlagsBits.PinMessages && !entry.allowed));
  });

  it("rejects members that are not in the guild", async () => {
    const guild = mockGuild();
    const channel = (guild.channels.cache.get(TEXT_ID) ?? null) as never;
    const inspection = await inspectGuildMember(guild, FOREIGN_ID, channel);
    assert.ok("error" in inspection);
  });
});

const COURSE_ID = "100000000000000010";
const PARENT_ROLE_ID = "100000000000000011";
const NULL_PERM_ROLE_ID = "100000000000000012";

function mockRole(id: string, name: string, position: number) {
  return {
    id,
    name,
    position,
    permissions: bitfield(0n),
    managed: false,
    mentionable: false,
    editable: true,
    color: 0,
  };
}

function matrixGuild(options: { extraStaff?: number; nullPermsForCourse?: boolean } = {}): Guild {
  const extraStaff = options.extraStaff ?? 30;
  const everyone = mockRole(GUILD_ID, "@everyone", 0);
  const course = mockRole(COURSE_ID, "Indie Course", 1);
  const parentRole = mockRole(PARENT_ROLE_ID, "Category Course", 2);
  const nullRole = mockRole(NULL_PERM_ROLE_ID, "Broken", 3);
  const staff = Array.from({ length: extraStaff }, (_, i) =>
    mockRole(`1100000000000000${String(i).padStart(2, "0")}`, `Admin (${i})`, 100 + i)
  );
  const roles = new Map(
    [everyone, course, parentRole, nullRole, ...staff].map((role) => [role.id, role])
  );
  const category = {
    id: CATEGORY_ID,
    name: "courses",
    type: ChannelType.GuildCategory,
    parentId: null,
    permissionsLocked: null,
    permissionOverwrites: {
      cache: new Map([
        [
          PARENT_ROLE_ID,
          {
            id: PARENT_ROLE_ID,
            type: 0,
            allow: bitfield(PermissionFlagsBits.ViewChannel),
            deny: bitfield(0n),
          },
        ],
      ]),
    },
  };
  const text = {
    id: TEXT_ID,
    name: "general",
    type: ChannelType.GuildText,
    parentId: CATEGORY_ID,
    permissionsLocked: false,
    permissionOverwrites: {
      cache: new Map([
        [
          COURSE_ID,
          {
            id: COURSE_ID,
            type: 0,
            allow: bitfield(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages),
            deny: bitfield(0n),
          },
        ],
        [
          NULL_PERM_ROLE_ID,
          {
            id: NULL_PERM_ROLE_ID,
            type: 0,
            allow: bitfield(PermissionFlagsBits.ViewChannel),
            deny: bitfield(0n),
          },
        ],
      ]),
    },
    permissionsFor: (target: { id: string }) => {
      if (options.nullPermsForCourse && target.id === COURSE_ID) return null;
      if (target.id === NULL_PERM_ROLE_ID) return null;
      if (target.id === COURSE_ID) {
        return {
          has: (bit: bigint) =>
            bit === PermissionFlagsBits.ViewChannel || bit === PermissionFlagsBits.SendMessages,
        };
      }
      if (target.id === PARENT_ROLE_ID) {
        return { has: (bit: bigint) => bit === PermissionFlagsBits.ViewChannel };
      }
      return { has: () => false };
    },
  };
  const channels = new Map([
    [CATEGORY_ID, category],
    [TEXT_ID, text],
  ]);
  const botMember = {
    id: BOT_ID,
    displayName: "Clippy",
    user: { username: "clippy", bot: true },
    roles: { highest: { position: 8, name: "Clippy" }, cache: new Map() },
    permissions: bitfield(0n),
    isCommunicationDisabled: () => false,
    communicationDisabledUntil: null,
  };

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
      fetch: async () => undefined,
      cache: {
        values: () => channels.values(),
        get: (id: string) => channels.get(id),
      },
    },
    members: {
      me: botMember,
      fetchMe: async () => botMember,
      fetch: async () => new Map(),
      cache: { values: () => [].values(), get: () => undefined },
    },
  } as unknown as Guild;
}

describe("inspectRoleEffectiveInChannel", () => {
  it("keeps low-position overwrite targets when more than 24 staff roles exist", async () => {
    const guild = matrixGuild({ extraStaff: 30 });
    assert.ok(30 + 4 > MAX_CHANNEL_ROLE_MATRIX);
    const snapshot = await buildGuildSnapshot(guild);
    const channel = guild.channels.cache.get(TEXT_ID) as never;
    const matrix = inspectRoleEffectiveInChannel(guild, snapshot, channel);
    const ids = matrix.roles.map((entry) => entry.roleId);

    assert.ok(ids.includes(GUILD_ID));
    assert.ok(ids.includes(COURSE_ID));
    assert.ok(ids.includes(PARENT_ROLE_ID));
    assert.ok(ids.includes(NULL_PERM_ROLE_ID));
    assert.ok(matrix.omittedCount > 0);
    assert.equal(matrix.roles.filter((entry) => entry.kind === "staff").length, MAX_CHANNEL_ROLE_MATRIX - 4);

    const inspection = inspectChannel(snapshot, TEXT_ID);
    assert.ok(inspection);
    const dto = toChannelInspectionDto(snapshot, inspection!, matrix);
    assert.equal(dto.roleEffectiveOmitted, matrix.omittedCount);
    assert.ok(dto.roleEffective.some((entry) => entry.roleId === COURSE_ID));
    assert.ok(dto.roleEffective.some((entry) => entry.roleId === PARENT_ROLE_ID));
    JSON.stringify(dto);
  });

  it("reports computed=false when permissionsFor returns null", async () => {
    const guild = matrixGuild({ extraStaff: 0, nullPermsForCourse: true });
    const snapshot = await buildGuildSnapshot(guild);
    const channel = guild.channels.cache.get(TEXT_ID) as never;
    const matrix = inspectRoleEffectiveInChannel(guild, snapshot, channel);
    const course = matrix.roles.find((entry) => entry.roleId === COURSE_ID);
    const broken = matrix.roles.find((entry) => entry.roleId === NULL_PERM_ROLE_ID);
    assert.ok(course);
    assert.equal(course!.computed, false);
    assert.deepEqual(course!.effective, []);
    assert.ok(broken);
    assert.equal(broken!.computed, false);
    const parent = matrix.roles.find((entry) => entry.roleId === PARENT_ROLE_ID);
    assert.equal(parent?.computed, true);
    assert.ok(parent?.effective.some((entry) => entry.bit === PermissionFlagsBits.ViewChannel && entry.allowed));
  });
});
