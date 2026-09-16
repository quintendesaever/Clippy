import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionFlagsBits } from "discord.js";
import {
  assertEmbedsWithinDiscordLimits,
  DISCORD_EMBED_DESCRIPTION_LIMIT,
  DISCORD_EMBED_FIELD_VALUE_LIMIT,
  DISCORD_EMBED_TITLE_LIMIT,
  formatAuditEmbeds,
  formatChannelEmbeds,
  formatRoleEmbeds,
  formatUserEmbeds,
} from "./format.js";
import { inspectRole } from "./inspect.js";
import { RELEVANT_PERMISSIONS } from "./flags.js";
import { CLIPPY_SERVER_POLICY } from "./serverPolicy.js";
import type { Finding, GuildSnapshot, RoleSnapshot, UserInspection } from "./types.js";

const GUILD_ID = "guild-1";

function role(partial: Partial<RoleSnapshot> & Pick<RoleSnapshot, "id" | "name">): RoleSnapshot {
  return {
    position: 1,
    permissions: 0n,
    managed: false,
    mentionable: true,
    editable: true,
    ...partial,
  };
}

function snapshot(roles: RoleSnapshot[]): GuildSnapshot {
  return {
    id: GUILD_ID,
    name: "Clippy Test",
    roles,
    channels: Array.from({ length: 20 }, (_, i) => ({
      id: `ch-${i}`,
      name: `channel-${i}`,
      kind: "text" as const,
      parentId: null,
      permissionsLocked: null,
      overwrites: [
        {
          id: "student",
          type: "role" as const,
          allow: PermissionFlagsBits.ViewChannel,
          deny: 0n,
        },
      ],
    })),
    bot: { memberId: "bot-1", highestRolePosition: 1, resolved: true },
    rolesFetchIncomplete: false,
    channelsFetchIncomplete: false,
  };
}

describe("formatAuditEmbeds", () => {
  it("truncates within Discord limits and reports omitted findings", () => {
    const findings: Finding[] = Array.from({ length: 80 }, (_, i) => ({
      severity: "fail",
      code: `fail_${i}`,
      title: `Finding ${i} ${"x".repeat(80)}`,
      detail: `Detail ${i} ${"y".repeat(200)}`,
    }));
    const embeds = formatAuditEmbeds("Clippy Test", GUILD_ID, { findings });
    assertEmbedsWithinDiscordLimits(embeds);
    const packed = embeds.map((embed) => embed.toJSON());
    assert.ok(packed.some((embed) => embed.title && embed.title.length <= DISCORD_EMBED_TITLE_LIMIT));
    assert.ok(
      packed.some(
        (embed) =>
          (embed.description?.includes("…and ") ?? false) ||
          embed.fields?.some((field) => field.value.includes("…and "))
      )
    );
    for (const embed of packed) {
      assert.ok((embed.description?.length ?? 0) <= DISCORD_EMBED_DESCRIPTION_LIMIT);
    }
  });
});

describe("effective permission formatting", () => {
  it("distinguishes factual allow and deny with check marks", () => {
    const inspection: UserInspection = {
      userId: "u1",
      displayName: "Ada",
      channelId: "c1",
      channelName: "general",
      roles: [{ id: "r1", name: "Indie" }],
      effective: [
        { bit: PermissionFlagsBits.ViewChannel, allowed: true },
        { bit: PermissionFlagsBits.SendMessages, allowed: true },
        { bit: PermissionFlagsBits.MentionEveryone, allowed: false },
        { bit: PermissionFlagsBits.Administrator, allowed: false },
      ],
      administrator: false,
      owner: false,
      timedOut: false,
      timeoutUntil: null,
      computed: true,
      notes: [],
    };
    const [embed] = formatUserEmbeds(inspection);
    const json = embed.toJSON();
    const field = json.fields?.find((entry) => entry.name.includes("Effective"));
    assert.ok(field);
    assert.match(field!.value, /✅ View Channel/);
    assert.match(field!.value, /❌ Mention Everyone/);
    assert.doesNotMatch(field!.value, /✅ Mention Everyone/);
    assertEmbedsWithinDiscordLimits([embed]);
  });

  it("notes Administrator, owner, and timeout separately", () => {
    const inspection: UserInspection = {
      userId: "owner",
      displayName: "Owner",
      channelId: "c1",
      channelName: "general",
      roles: [{ id: "admin", name: "Admin" }],
      effective: RELEVANT_PERMISSIONS.map((bit) => ({ bit, allowed: true })),
      administrator: true,
      owner: true,
      timedOut: true,
      timeoutUntil: "2026-09-16T15:00:00.000Z",
      computed: true,
      notes: [],
    };
    const [embed] = formatUserEmbeds(inspection);
    const notes = embed.toJSON().fields?.find((entry) => entry.name === "Notes")?.value ?? "";
    assert.match(notes, /Administrator/);
    assert.match(notes, /owner/i);
    assert.match(notes, /timed out/i);
  });

  it("gracefully reports when effective permissions cannot be computed", () => {
    const inspection: UserInspection = {
      userId: "u1",
      displayName: "Ada",
      channelId: "c1",
      channelName: "general",
      roles: [],
      effective: [],
      administrator: false,
      owner: false,
      timedOut: false,
      timeoutUntil: null,
      computed: false,
      notes: ["permissionsFor returned null"],
    };
    const [embed] = formatUserEmbeds(inspection);
    const field = embed.toJSON().fields?.find((entry) => entry.name.includes("Effective"));
    assert.match(field!.value, /Could not compute/);
  });
});

describe("role and channel formatting", () => {
  it("caps role channel overrides with an omitted count", () => {
    const inspection = inspectRole(
      snapshot([
        role({ id: GUILD_ID, name: "@everyone", position: 0 }),
        role({
          id: "student",
          name: "Student",
          permissions: PermissionFlagsBits.ViewChannel,
        }),
      ]),
      "student"
    );
    assert.ok(inspection);
    assert.ok(inspection!.omittedOverrides > 0);
    const [embed] = formatRoleEmbeds(inspection!);
    const json = embed.toJSON();
    const overrides = json.fields?.find((field) => field.name.includes("overrides"));
    assert.ok(overrides);
    assert.match(overrides!.value, /…and \d+ more/);
    assert.ok(overrides!.value.length <= DISCORD_EMBED_FIELD_VALUE_LIMIT);
    assert.match(json.fields?.find((field) => field.name.includes("Manageability"))?.value ?? "", /manageability|hierarchy|edit/i);
  });

  it("labels manageability separately from inspectability when the bot member is unknown", () => {
    const inspection = inspectRole(
      {
        id: GUILD_ID,
        name: "Clippy Test",
        roles: [
          role({ id: GUILD_ID, name: "@everyone", position: 0, editable: null }),
          role({
            id: CLIPPY_SERVER_POLICY.pinExpectedRoleIds[0],
            name: "Indie",
            permissions: PermissionFlagsBits.PinMessages,
            editable: null,
          }),
        ],
        channels: [],
        bot: { memberId: null, highestRolePosition: null, resolved: false },
        rolesFetchIncomplete: false,
        channelsFetchIncomplete: false,
      },
      CLIPPY_SERVER_POLICY.pinExpectedRoleIds[0]
    );
    assert.ok(inspection);
    const [embed] = formatRoleEmbeds(inspection!);
    const manage = embed.toJSON().fields?.find((field) => field.name.includes("Manageability"))?.value ?? "";
    const notes = embed.toJSON().fields?.find((field) => field.name === "Notes")?.value ?? "";
    assert.match(manage, /unknown/i);
    assert.match(notes, /inspect/i);
  });
});

describe("formatChannelEmbeds", () => {
  it("highlights @everyone and member overwrites", () => {
    const [embed] = formatChannelEmbeds({
      channel: {
        id: "welcome",
        name: "welcome",
        kind: "text",
        parentId: null,
        permissionsLocked: null,
        overwrites: [],
      },
      parentName: null,
      overwrites: [
        {
          id: GUILD_ID,
          type: "role",
          name: "@everyone",
          allow: PermissionFlagsBits.ManageChannels,
          deny: 0n,
          everyone: true,
          member: false,
        },
        {
          id: "user-9",
          type: "member",
          name: "member user-9",
          allow: PermissionFlagsBits.ViewChannel,
          deny: 0n,
          everyone: false,
          member: true,
        },
      ],
      botEffective: [{ bit: PermissionFlagsBits.ViewChannel, allowed: false }],
      botCanView: false,
      notes: ["Clippy cannot view this channel. Cached overwrite facts are still shown."],
    });
    const json = embed.toJSON();
    const overwrites = json.fields?.find((field) => field.name.includes("overwrites"))?.value ?? "";
    assert.match(overwrites, /@everyone/);
    assert.match(overwrites, /member-specific/);
    assert.match(json.fields?.find((field) => field.name === "Notes")?.value ?? "", /cannot view/i);
    assertEmbedsWithinDiscordLimits([embed]);
  });
});
