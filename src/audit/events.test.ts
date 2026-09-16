import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { summarizeBotSettingsChanges, type BotConfigSnapshot } from "./botConfigSummary.js";
import {
  isAuditableChannelType,
  summarizeChannelUpdate,
  summarizeRoleUpdate,
  type ChannelSnapshot,
  type RoleSnapshot,
} from "./summaries.js";

function role(partial: Partial<RoleSnapshot> = {}): RoleSnapshot {
  return {
    id: "r1",
    name: "mods",
    hexColor: "#99aab5",
    permissions: 0n,
    managed: false,
    ...partial,
  };
}

function channel(partial: Partial<ChannelSnapshot> = {}): ChannelSnapshot {
  return {
    id: "c1",
    name: "general",
    type: ChannelType.GuildText,
    parentId: "cat1",
    ...partial,
  };
}

describe("role and channel summaries", () => {
  it("logs name, color, and permission changes but skips position-only updates", () => {
    assert.equal(summarizeRoleUpdate(role(), role()), null);
    const named = summarizeRoleUpdate(role(), role({ name: "moderators" }));
    assert.deepEqual(named, ["Name: mods → moderators"]);
    const colored = summarizeRoleUpdate(role(), role({ hexColor: "#ff0000" }));
    assert.deepEqual(colored, ["Color: #99aab5 → #ff0000"]);
    const perms = summarizeRoleUpdate(
      role(),
      role({ permissions: PermissionFlagsBits.ManageGuild })
    );
    assert.ok(perms?.[0]?.includes("ManageGuild"));
    assert.equal(summarizeRoleUpdate(role({ managed: true }), role({ name: "bot" })), null);
  });

  it("logs name/parent/type for text channels and skips voice", () => {
    assert.equal(isAuditableChannelType(ChannelType.GuildText), true);
    assert.equal(isAuditableChannelType(ChannelType.GuildVoice), false);
    assert.equal(
      summarizeChannelUpdate(
        channel({ type: ChannelType.GuildVoice }),
        channel({ type: ChannelType.GuildVoice, name: "voice-2" })
      ),
      null
    );
    assert.deepEqual(summarizeChannelUpdate(channel(), channel({ name: "chat" })), [
      "Name: general → chat",
    ]);
    assert.ok(
      summarizeChannelUpdate(channel(), channel({ parentId: "cat2" }))?.[0]?.includes("Category")
    );
  });
});

describe("summarizeBotSettingsChanges", () => {
  function payload(partial: Partial<BotConfigSnapshot> = {}): BotConfigSnapshot {
    return {
      timezone: "Europe/Brussels",
      f1: {
        enabled: false,
        channelId: null,
        roleId: null,
        predictionUrl: null,
      },
      library: {
        enabled: false,
        channelId: null,
        openMinutes: 480,
        closeMinutes: 1320,
      },
      logging: {
        enabled: false,
        channelId: null,
        logMembers: true,
        logRoles: true,
        logChannels: true,
        logBotConfig: true,
        logCommandErrors: true,
      },
      ...partial,
    };
  }

  it("describes timezone, f1, and logging changes without prediction URL values", () => {
    const details = summarizeBotSettingsChanges(
      payload(),
      payload({
        timezone: "Europe/Amsterdam",
        f1: {
          enabled: true,
          channelId: "c1",
          roleId: "r1",
          predictionUrl: "https://secret.example/predict?token=abc",
        },
        library: {
          enabled: true,
          channelId: "c3",
          openMinutes: 9 * 60,
          closeMinutes: 21 * 60,
        },
        logging: {
          enabled: true,
          channelId: "c2",
          logMembers: true,
          logRoles: false,
          logChannels: true,
          logBotConfig: true,
          logCommandErrors: true,
        },
      })
    );
    assert.ok(details.some((line) => line.includes("Timezone")));
    assert.ok(details.some((line) => line.includes("F1 reminders")));
    assert.ok(details.some((line) => line.includes("F1 prediction URL updated")));
    assert.ok(details.some((line) => line.includes("Library")));
    assert.ok(details.some((line) => line.includes("09:00–21:00")));
    assert.ok(details.every((line) => !line.includes("secret.example")));
    assert.ok(details.every((line) => !line.includes("token=abc")));
    assert.ok(details.some((line) => line.includes("Audit logging")));
    assert.ok(details.some((line) => line.includes("Log roles")));
  });
});
