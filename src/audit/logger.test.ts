import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EmbedBuilder } from "discord.js";
import { deliverAuditEvent, type AuditDiscordPort } from "./deliver.js";
import { emptyAuditLogSettings, isAuditCategoryEnabled } from "./types.js";
import type { AuditEvent, AuditLogSettings } from "./types.js";

const event: AuditEvent = {
  guildId: "g1",
  category: "members",
  title: "Member joined",
  severity: "success",
  actor: { id: "u1", tag: "alice" },
};

function settings(partial: Partial<AuditLogSettings> = {}): AuditLogSettings {
  return {
    ...emptyAuditLogSettings("g1"),
    enabled: true,
    channel_id: "c1",
    ...partial,
  };
}

describe("isAuditCategoryEnabled", () => {
  it("defaults categories on and master switch off", () => {
    const defaults = emptyAuditLogSettings("g1");
    assert.equal(defaults.enabled, false);
    assert.equal(defaults.log_members, true);
    assert.equal(defaults.log_roles, true);
    assert.equal(isAuditCategoryEnabled(defaults, "members"), false);
    assert.equal(isAuditCategoryEnabled({ ...defaults, enabled: true }, "members"), true);
    assert.equal(
      isAuditCategoryEnabled({ ...defaults, enabled: true, log_members: false }, "members"),
      false
    );
  });
});

describe("deliverAuditEvent", () => {
  it("sends an embed when enabled and the category is on", async () => {
    const sent: string[] = [];
    const discord: AuditDiscordPort = {
      async fetchSendableChannel() {
        return { id: "c1" };
      },
      async sendEmbed(channelId, embed) {
        assert.equal(channelId, "c1");
        assert.ok(embed instanceof EmbedBuilder);
        sent.push(embed.toJSON().title ?? "");
        return true;
      },
    };
    const result = await deliverAuditEvent({ event, settings: settings(), discord });
    assert.equal(result.ok, true);
    assert.deepEqual(sent, ["Member joined"]);
  });

  it("skips silently when logging is disabled", async () => {
    let fetched = false;
    const discord: AuditDiscordPort = {
      async fetchSendableChannel() {
        fetched = true;
        return { id: "c1" };
      },
      async sendEmbed() {
        return true;
      },
    };
    const result = await deliverAuditEvent({
      event,
      settings: settings({ enabled: false }),
      discord,
    });
    assert.deepEqual(result, { ok: false, reason: "disabled" });
    assert.equal(fetched, false);
  });

  it("skips when the category toggle is off", async () => {
    const discord: AuditDiscordPort = {
      async fetchSendableChannel() {
        throw new Error("should not fetch");
      },
      async sendEmbed() {
        throw new Error("should not send");
      },
    };
    const result = await deliverAuditEvent({
      event,
      settings: settings({ log_members: false }),
      discord,
    });
    assert.deepEqual(result, { ok: false, reason: "category_off" });
  });

  it("fails soft when the channel is missing", async () => {
    const discord: AuditDiscordPort = {
      async fetchSendableChannel() {
        return null;
      },
      async sendEmbed() {
        throw new Error("should not send");
      },
    };
    const result = await deliverAuditEvent({ event, settings: settings(), discord });
    assert.deepEqual(result, { ok: false, reason: "no_channel" });
  });

  it("fails soft when send throws or returns false", async () => {
    const discord: AuditDiscordPort = {
      async fetchSendableChannel() {
        return { id: "c1" };
      },
      async sendEmbed() {
        return false;
      },
    };
    const result = await deliverAuditEvent({ event, settings: settings(), discord });
    assert.deepEqual(result, { ok: false, reason: "send_failed" });
  });
});
