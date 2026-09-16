import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EmbedBuilder } from "discord.js";
import { emptyLibrarySettings } from "./settingsPatch.js";
import {
  reconcileLibraryPanelState,
  retireLibraryPanelState,
  storedPanelFromSettings,
  withGuildLibraryLock,
  type LibraryReconcileDiscord,
} from "./panelReconcile.js";
import { buildDisabledLibraryPayload, type LibraryMessagePayload } from "./view.js";

const payload: LibraryMessagePayload = {
  embeds: [new EmbedBuilder().setTitle("library")],
  components: [],
};
const retirePayload = buildDisabledLibraryPayload();

function fakeDiscord(options: {
  exists?: boolean;
  fetchResult?: "ok" | "missing" | "error";
  editResult?: "ok" | "missing";
  sendId?: string;
  deleteThrows?: boolean;
}): LibraryReconcileDiscord & {
  edits: number;
  sends: number;
  pins: number;
  deleted: string[];
  fetched: string[];
} {
  const state = { edits: 0, sends: 0, pins: 0, deleted: [] as string[], fetched: [] as string[] };
  return {
    get edits() {
      return state.edits;
    },
    get sends() {
      return state.sends;
    },
    get pins() {
      return state.pins;
    },
    get deleted() {
      return state.deleted;
    },
    get fetched() {
      return state.fetched;
    },
    async fetchMessage(channelId, messageId) {
      state.fetched.push(`${channelId}:${messageId}`);
      if (options.fetchResult) return options.fetchResult;
      return options.exists === false ? "missing" : "ok";
    },
    async editMessage() {
      state.edits += 1;
      return options.editResult ?? "ok";
    },
    async sendMessage(channelId) {
      state.sends += 1;
      return { channelId, messageId: options.sendId ?? "new-msg" };
    },
    async pinMessage() {
      state.pins += 1;
    },
    async deleteMessage(channelId, messageId) {
      if (options.deleteThrows) throw new Error("rate limited");
      state.deleted.push(`${channelId}:${messageId}`);
      return "ok";
    },
  };
}

describe("storedPanelFromSettings", () => {
  it("uses message_channel_id, not the configured channel_id", () => {
    const stored = storedPanelFromSettings({
      message_id: "m1",
      message_channel_id: "old",
    });
    assert.deepEqual(stored, { channelId: "old", messageId: "m1" });
    assert.equal(storedPanelFromSettings({ message_id: "m1", message_channel_id: null }), null);
  });
});

describe("production settings glue after channel change", () => {
  it("looks up and removes the old panel after configured channel_id is overwritten", async () => {
    const existing = emptyLibrarySettings("g1");
    existing.enabled = true;
    existing.channel_id = "old";
    existing.message_channel_id = "old";
    existing.message_id = "m1";

    const afterSave = { ...existing, channel_id: "new" };
    assert.equal(afterSave.channel_id, "new");
    assert.equal(afterSave.message_channel_id, "old");
    assert.equal(afterSave.message_id, "m1");

    const stored = storedPanelFromSettings(afterSave);
    assert.equal(stored?.channelId, "old");

    const discord = fakeDiscord({ exists: true, sendId: "moved" });
    const result = await reconcileLibraryPanelState({
      stored,
      targetChannelId: afterSave.channel_id!,
      payload,
      retirePayload,
      discord,
    });
    assert.equal(result.action, "recreated");
    assert.equal(result.panel.channelId, "new");
    assert.equal(result.panel.messageId, "moved");
    assert.equal(discord.sends, 1);
    assert.deepEqual(discord.deleted, ["old:m1"]);
    assert.equal(discord.fetched.length, 0);
  });
});

describe("reconcileLibraryPanelState", () => {
  it("edits the stored message instead of sending a duplicate", async () => {
    const discord = fakeDiscord({ exists: true, editResult: "ok" });
    const result = await reconcileLibraryPanelState({
      stored: { channelId: "c1", messageId: "m1" },
      targetChannelId: "c1",
      payload,
      retirePayload,
      discord,
    });
    assert.equal(result.action, "updated");
    assert.equal(result.panel.messageId, "m1");
    assert.equal(discord.edits, 1);
    assert.equal(discord.sends, 0);
    assert.equal(discord.pins, 0);
  });

  it("recreates and pins when the stored message is missing", async () => {
    const discord = fakeDiscord({ exists: false });
    const result = await reconcileLibraryPanelState({
      stored: { channelId: "c1", messageId: "m1" },
      targetChannelId: "c1",
      payload,
      retirePayload,
      discord,
    });
    assert.equal(result.action, "recreated");
    assert.equal(result.panel.messageId, "new-msg");
    assert.equal(discord.sends, 1);
    assert.equal(discord.pins, 1);
  });

  it("does not send a duplicate when fetch hits a transient error", async () => {
    const discord = fakeDiscord({ fetchResult: "error" });
    await assert.rejects(
      () =>
        reconcileLibraryPanelState({
          stored: { channelId: "c1", messageId: "m1" },
          targetChannelId: "c1",
          payload,
          retirePayload,
          discord,
        }),
      /fetch failed/
    );
    assert.equal(discord.sends, 0);
    assert.equal(discord.edits, 0);
  });

  it("sends in the new channel when the configured channel changed", async () => {
    const discord = fakeDiscord({ exists: true, sendId: "moved" });
    const result = await reconcileLibraryPanelState({
      stored: { channelId: "old", messageId: "m1" },
      targetChannelId: "new",
      payload,
      retirePayload,
      discord,
    });
    assert.equal(result.action, "recreated");
    assert.equal(result.panel.channelId, "new");
    assert.equal(result.panel.messageId, "moved");
    assert.equal(discord.sends, 1);
    assert.deepEqual(discord.deleted, ["old:m1"]);
  });
});

describe("retireLibraryPanelState", () => {
  it("deletes the live panel and reports cleared", async () => {
    const discord = fakeDiscord({});
    const result = await retireLibraryPanelState({
      stored: { channelId: "c1", messageId: "m1" },
      payload: retirePayload,
      discord,
    });
    assert.equal(result, "cleared");
    assert.equal(discord.edits, 1);
    assert.deepEqual(discord.deleted, ["c1:m1"]);
    assert.equal(retirePayload.components.length, 0);
  });

  it("keeps identity when delete fails after disabling buttons", async () => {
    const discord = fakeDiscord({ deleteThrows: true });
    const result = await retireLibraryPanelState({
      stored: { channelId: "c1", messageId: "m1" },
      payload: retirePayload,
      discord,
    });
    assert.equal(result, "frozen");
    assert.equal(discord.edits, 1);
    assert.deepEqual(discord.deleted, []);
  });

  it("reports absent when no panel is stored", async () => {
    const discord = fakeDiscord({});
    const result = await retireLibraryPanelState({
      stored: null,
      payload: retirePayload,
      discord,
    });
    assert.equal(result, "absent");
    assert.equal(discord.sends, 0);
    assert.equal(discord.edits, 0);
  });
});

describe("withGuildLibraryLock", () => {
  it("serializes reconciles so a second caller sees the persisted message", async () => {
    const state: { messageId: string | null; sends: number; edits: number } = {
      messageId: null,
      sends: 0,
      edits: 0,
    };
    const discord: LibraryReconcileDiscord = {
      async fetchMessage() {
        return state.messageId ? "ok" : "missing";
      },
      async editMessage() {
        state.edits += 1;
        return "ok";
      },
      async sendMessage(channelId) {
        state.sends += 1;
        state.messageId = `msg-${state.sends}`;
        return { channelId, messageId: state.messageId };
      },
      async pinMessage() {
        return;
      },
      async deleteMessage() {
        return "ok";
      },
    };

    async function run() {
      return withGuildLibraryLock("library-lock-test", async () => {
        const stored = state.messageId ? { channelId: "c1", messageId: state.messageId } : null;
        return reconcileLibraryPanelState({
          stored,
          targetChannelId: "c1",
          payload,
          retirePayload,
          discord,
        });
      });
    }

    await Promise.all([run(), run()]);
    assert.equal(state.sends, 1);
    assert.equal(state.edits, 1);
  });
});
