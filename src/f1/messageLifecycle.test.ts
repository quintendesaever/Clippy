import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EmbedBuilder } from "discord.js";
import { replaceActiveF1Message, type F1DiscordPort, type F1SettingsPort } from "./messageLifecycle.js";
import type { F1MessagePayload } from "./embeds.js";
import type { F1ReminderSettings } from "./reminderStorage.js";

function settings(partial: Partial<F1ReminderSettings> = {}): F1ReminderSettings {
  return {
    guild_id: "g1",
    enabled: true,
    channel_id: "c1",
    role_id: "r1",
    last_race_id_notified: null,
    prediction_url: "https://example.com/predict",
    active_message_id: "old-msg",
    current_meeting_id: "2026-50",
    last_stage_sent: "predictions_open",
    qualifying_start_at: null,
    race_start_at: null,
    ...partial,
  };
}

const payload: F1MessagePayload = {
  content: "<@&r1> hello",
  embeds: [new EmbedBuilder().setTitle("test")],
  components: [],
};

describe("replaceActiveF1Message", () => {
  it("deletes the previous message, sends a new one, and persists the new id", async () => {
    const deleted: string[] = [];
    let stored = settings();
    const discord: F1DiscordPort = {
      async fetchChannel() {
        return { id: "c1" };
      },
      async deleteMessage(_channelId, messageId) {
        deleted.push(messageId);
        return "deleted";
      },
      async sendMessage() {
        return { messageId: "new-msg" };
      },
    };
    const storage: F1SettingsPort = {
      async upsert(partial) {
        stored = { ...stored, ...partial };
        return stored;
      },
    };

    const result = await replaceActiveF1Message({
      guildId: "g1",
      channelId: "c1",
      settings: stored,
      payload,
      discord,
      storage,
      persist: { stage: "final_prediction", meetingId: "2026-50" },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.messageId, "new-msg");
      assert.equal(result.settings.last_stage_sent, "final_prediction");
    }
    assert.deepEqual(deleted, ["old-msg"]);
    assert.equal(stored.active_message_id, "new-msg");
  });

  it("treats an already-deleted Discord message as success", async () => {
    let stored = settings();
    const discord: F1DiscordPort = {
      async fetchChannel() {
        return { id: "c1" };
      },
      async deleteMessage() {
        return "missing";
      },
      async sendMessage() {
        return { messageId: "new-msg" };
      },
    };
    const storage: F1SettingsPort = {
      async upsert(partial) {
        stored = { ...stored, ...partial };
        return stored;
      },
    };
    const result = await replaceActiveF1Message({
      guildId: "g1",
      channelId: "c1",
      settings: stored,
      payload,
      discord,
      storage,
      persist: { stage: "race_soon" },
    });
    assert.equal(result.ok, true);
    assert.equal(stored.active_message_id, "new-msg");
  });

  it("does not mark the stage sent when the channel is missing", async () => {
    const discord: F1DiscordPort = {
      async fetchChannel() {
        return null;
      },
      async deleteMessage() {
        return "failed";
      },
      async sendMessage() {
        throw new Error("should not send");
      },
    };
    const result = await replaceActiveF1Message({
      guildId: "g1",
      channelId: "c1",
      settings: settings(),
      payload,
      discord,
      storage: {
        async upsert() {
          throw new Error("should not upsert");
        },
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_channel");
  });

  it("leaves the stage unsent when send fails after clearing the old id", async () => {
    let stored = settings();
    const discord: F1DiscordPort = {
      async fetchChannel() {
        return { id: "c1" };
      },
      async deleteMessage() {
        return "deleted";
      },
      async sendMessage() {
        return null;
      },
    };
    const storage: F1SettingsPort = {
      async upsert(partial) {
        stored = { ...stored, ...partial };
        return stored;
      },
    };
    const result = await replaceActiveF1Message({
      guildId: "g1",
      channelId: "c1",
      settings: stored,
      payload,
      discord,
      storage,
      persist: { stage: "final_prediction" },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "send_failed");
    assert.equal(stored.active_message_id, null);
    assert.equal(stored.last_stage_sent, "predictions_open");
  });

  it("rolls back the new Discord message when persist fails", async () => {
    const deleted: string[] = [];
    let upserts = 0;
    const discord: F1DiscordPort = {
      async fetchChannel() {
        return { id: "c1" };
      },
      async deleteMessage(_channelId, messageId) {
        deleted.push(messageId);
        return "deleted";
      },
      async sendMessage() {
        return { messageId: "new-msg" };
      },
    };
    const storage: F1SettingsPort = {
      async upsert(partial) {
        upserts += 1;
        if (partial.active_message_id === "new-msg") return null;
        return settings({ ...partial });
      },
    };
    const result = await replaceActiveF1Message({
      guildId: "g1",
      channelId: "c1",
      settings: settings(),
      payload,
      discord,
      storage,
      persist: { stage: "final_prediction" },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "persist_failed");
    assert.ok(deleted.includes("old-msg"));
    assert.ok(deleted.includes("new-msg"));
    assert.ok(upserts >= 2);
  });

  it("can update the active message id without advancing last_stage_sent", async () => {
    let stored = settings({ last_stage_sent: "predictions_open", current_meeting_id: "2026-50" });
    const discord: F1DiscordPort = {
      async fetchChannel() {
        return { id: "c1" };
      },
      async deleteMessage() {
        return "deleted";
      },
      async sendMessage() {
        return { messageId: "preview-msg" };
      },
    };
    const storage: F1SettingsPort = {
      async upsert(partial) {
        stored = { ...stored, ...partial };
        return stored;
      },
    };
    const result = await replaceActiveF1Message({
      guildId: "g1",
      channelId: "c1",
      settings: stored,
      payload,
      discord,
      storage,
    });
    assert.equal(result.ok, true);
    assert.equal(stored.active_message_id, "preview-msg");
    assert.equal(stored.last_stage_sent, "predictions_open");
    assert.equal(stored.current_meeting_id, "2026-50");
  });
});
