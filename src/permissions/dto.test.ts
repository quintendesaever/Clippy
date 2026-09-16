import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionFlagsBits } from "discord.js";
import { evaluateAudit } from "./evaluate.js";
import { inspectChannel, inspectRole } from "./inspect.js";
import {
  assertJsonSafe,
  toChannelInspectionDto,
  toMemberInspectionDto,
  toOverviewDto,
  toRoleInspectionDto,
} from "./dto.js";
import { CLIPPY_SERVER_POLICY } from "./serverPolicy.js";
import type { ChannelSnapshot, GuildSnapshot, RoleSnapshot, UserInspection } from "./types.js";

const GUILD_ID = "guild-1";

function role(partial: Partial<RoleSnapshot> & Pick<RoleSnapshot, "id" | "name">): RoleSnapshot {
  return {
    position: 1,
    permissions: 0n,
    managed: false,
    mentionable: false,
    editable: true,
    color: 0,
    ...partial,
  };
}

function channel(partial: Partial<ChannelSnapshot> & Pick<ChannelSnapshot, "id" | "name">): ChannelSnapshot {
  return {
    kind: "text",
    parentId: null,
    permissionsLocked: null,
    overwrites: [],
    ...partial,
  };
}

function guild(partial: Partial<GuildSnapshot> = {}): GuildSnapshot {
  return {
    id: GUILD_ID,
    name: "Clippy Test",
    roles: [
      role({ id: GUILD_ID, name: "@everyone", position: 0 }),
      role({
        id: CLIPPY_SERVER_POLICY.pinExpectedRoleIds[0],
        name: "Indie",
        permissions: PermissionFlagsBits.PinMessages,
      }),
    ],
    channels: [],
    bot: { memberId: "bot-1", highestRolePosition: 8, highestRoleName: "Clippy", resolved: true },
    rolesFetchIncomplete: false,
    channelsFetchIncomplete: false,
    ...partial,
  };
}

describe("permission DTOs", () => {
  it("serializes overview findings without bigint and JSON.stringify succeeds", () => {
    const snapshot = guild({
      rolesFetchIncomplete: true,
      channelsFetchIncomplete: true,
      bot: { memberId: null, highestRolePosition: null, highestRoleName: null, resolved: false },
      channels: [
        channel({
          id: "welcome",
          name: "welcome",
          overwrites: [
            { id: GUILD_ID, type: "role", allow: PermissionFlagsBits.MentionEveryone, deny: 0n },
          ],
        }),
      ],
    });
    const result = evaluateAudit(snapshot);
    const dto = toOverviewDto(
      snapshot,
      result,
      [{ id: "u1", displayName: "Ada", username: "ada" }],
      true,
      "2026-09-16T12:00:00.000Z"
    );
    assertJsonSafe(dto);
    const json = JSON.stringify(dto);
    assert.equal(typeof json, "string");
    assert.equal(dto.writable, false);
    assert.equal(dto.counts.error, result.findings.filter((finding) => finding.severity === "fail").length);
    assert.equal(dto.counts.warning, result.findings.filter((finding) => finding.severity === "warn").length);
    assert.equal(dto.counts.expected, result.findings.filter((finding) => finding.severity === "ok").length);
    assert.equal(dto.incomplete.roles, true);
    assert.equal(dto.incomplete.channels, true);
    assert.equal(dto.incomplete.members, true);
    assert.ok(dto.bot.limitations.length > 0);
    assert.equal(dto.guild.id, GUILD_ID);
    assert.ok(!json.includes("n,"));
  });

  it("keeps dashboard role overrides uncapped while slash inspectRole stays capped", () => {
    const snapshot = guild({
      roles: [
        role({ id: GUILD_ID, name: "@everyone", position: 0 }),
        role({ id: "student", name: "Student", permissions: PermissionFlagsBits.ViewChannel }),
      ],
      channels: Array.from({ length: 20 }, (_, i) =>
        channel({
          id: `ch-${i}`,
          name: `channel-${i}`,
          overwrites: [
            { id: "student", type: "role", allow: PermissionFlagsBits.ViewChannel, deny: 0n },
          ],
        })
      ),
    });
    const slash = inspectRole(snapshot, "student");
    const dashboard = inspectRole(snapshot, "student", { overrideLimit: null });
    assert.ok(slash && dashboard);
    assert.equal(slash!.channelOverrides.length, 12);
    assert.ok(slash!.omittedOverrides > 0);
    assert.equal(dashboard!.channelOverrides.length, 20);
    assert.equal(dashboard!.omittedOverrides, 0);
    const dto = toRoleInspectionDto(dashboard!);
    assertJsonSafe(dto);
    JSON.stringify(dto);
    assert.equal(dto.channelOverrides.length, 20);
    assert.equal(typeof dto.permissions, "string");
    assert.ok(dto.basePermissions.some((entry) => entry.key === "ViewChannel" && entry.granted));
  });

  it("distinguishes category, inherited, and explicit overwrites plus target type", () => {
    const snapshot = guild({
      roles: [
        role({ id: GUILD_ID, name: "@everyone", position: 0 }),
        role({ id: "course", name: "Course", permissions: 0n }),
      ],
      channels: [
        channel({
          id: "cat",
          name: "Courses",
          kind: "category",
          overwrites: [
            { id: GUILD_ID, type: "role", allow: 0n, deny: PermissionFlagsBits.ViewChannel },
          ],
        }),
        channel({
          id: "synced",
          name: "announcements",
          parentId: "cat",
          permissionsLocked: true,
          overwrites: [
            { id: GUILD_ID, type: "role", allow: 0n, deny: PermissionFlagsBits.ViewChannel },
          ],
        }),
        channel({
          id: "custom",
          name: "general",
          parentId: "cat",
          permissionsLocked: false,
          overwrites: [
            { id: "course", type: "role", allow: PermissionFlagsBits.ViewChannel, deny: 0n },
            { id: "member-9", type: "member", allow: PermissionFlagsBits.ViewChannel, deny: 0n },
          ],
        }),
      ],
    });

    const category = inspectChannel(snapshot, "cat");
    const synced = inspectChannel(snapshot, "synced");
    const custom = inspectChannel(snapshot, "custom");
    assert.ok(category && synced && custom);

    const categoryDto = toChannelInspectionDto(snapshot, category!);
    const syncedDto = toChannelInspectionDto(snapshot, synced!);
    const customDto = toChannelInspectionDto(snapshot, custom!);
    assertJsonSafe(categoryDto);
    assertJsonSafe(syncedDto);
    assertJsonSafe(customDto);
    JSON.stringify(customDto);

    assert.equal(categoryDto.syncState, "category");
    assert.ok(categoryDto.overwrites.some((entry) => entry.source === "base" && entry.everyone));

    assert.equal(syncedDto.syncState, "synced");
    assert.ok(syncedDto.overwrites.some((entry) => entry.source === "inherited"));
    assert.ok(syncedDto.overwrites.some((entry) => entry.source === "category"));

    assert.equal(customDto.syncState, "unsynced");
    assert.ok(customDto.overwrites.some((entry) => entry.source === "explicit" && entry.type === "role"));
    assert.ok(customDto.overwrites.some((entry) => entry.source === "explicit" && entry.type === "member"));
    assert.ok(customDto.overwrites.some((entry) => entry.source === "category"));
  });

  it("serializes actual effective member permissions and owner/admin/timeout notes", () => {
    const inspection: UserInspection = {
      userId: "owner",
      displayName: "Owner",
      channelId: "c1",
      channelName: "general",
      roles: [{ id: "admin", name: "Admin" }],
      effective: [
        { bit: PermissionFlagsBits.ViewChannel, allowed: true },
        { bit: PermissionFlagsBits.PinMessages, allowed: false },
        { bit: PermissionFlagsBits.Administrator, allowed: true },
      ],
      administrator: true,
      owner: true,
      timedOut: true,
      timeoutUntil: "2026-09-16T15:00:00.000Z",
      computed: true,
      notes: [],
    };
    const dto = toMemberInspectionDto(inspection);
    assertJsonSafe(dto);
    JSON.stringify(dto);
    assert.equal(dto.computed, true);
    assert.equal(dto.owner, true);
    assert.equal(dto.administrator, true);
    assert.equal(dto.timedOut, true);
    assert.ok(dto.notes.some((note) => /owner/i.test(note)));
    assert.ok(dto.notes.some((note) => /Administrator/.test(note)));
    assert.ok(dto.notes.some((note) => /timed out/i.test(note)));
    assert.ok(dto.permissions.some((entry) => entry.key === "ViewChannel" && entry.allowed));
    assert.ok(dto.permissions.some((entry) => entry.key === "PinMessages" && entry.allowed === false));
  });

  it("inspectRole returns null for unknown role ids", () => {
    assert.equal(inspectRole(guild(), "missing-role"), null);
    assert.equal(inspectChannel(guild(), "missing-channel"), null);
  });
});
