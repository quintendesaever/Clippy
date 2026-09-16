import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EmbedBuilder } from "discord.js";
import {
  reconcileLibraryPanelState,
  withGuildLibraryLock,
  type LibraryReconcileDiscord,
} from "./panelReconcile.js";
import type { LibraryMessagePayload } from "./view.js";

const payload: LibraryMessagePayload = {
  embeds: [new EmbedBuilder().setTitle("library")],
  components: [],
};

function fakeDiscord(options: {
  exists?: boolean;
  editResult?: "ok" | "missing";
  sendId?: string;
}): LibraryReconcileDiscord & { edits: number; sends: number; pins: number; deleted: string[] } {
  const state = { edits: 0, sends: 0, pins: 0, deleted: [] as string[] };
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
    async fetchMessage() {
      return options.exists !== false;
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
    async deleteMessage(_channelId, messageId) {
      state.deleted.push(messageId);
    },
  };
}

describe("reconcileLibraryPanelState", () => {
  it("edits the stored message instead of sending a duplicate", async () => {
    const discord = fakeDiscord({ exists: true, editResult: "ok" });
    const result = await reconcileLibraryPanelState({
      stored: { channelId: "c1", messageId: "m1" },
      targetChannelId: "c1",
      payload,
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
      discord,
    });
    assert.equal(result.action, "recreated");
    assert.equal(result.panel.messageId, "new-msg");
    assert.equal(discord.sends, 1);
    assert.equal(discord.pins, 1);
  });

  it("sends in the new channel when the configured channel changed", async () => {
    const discord = fakeDiscord({ exists: true, sendId: "moved" });
    const result = await reconcileLibraryPanelState({
      stored: { channelId: "old", messageId: "m1" },
      targetChannelId: "new",
      payload,
      discord,
    });
    assert.equal(result.action, "recreated");
    assert.equal(result.panel.channelId, "new");
    assert.equal(result.panel.messageId, "moved");
    assert.equal(discord.sends, 1);
    assert.deepEqual(discord.deleted, ["m1"]);
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
        return Boolean(state.messageId);
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
        return;
      },
    };

    async function run() {
      return withGuildLibraryLock("library-lock-test", async () => {
        const stored = state.messageId ? { channelId: "c1", messageId: state.messageId } : null;
        return reconcileLibraryPanelState({
          stored,
          targetChannelId: "c1",
          payload,
          discord,
        });
      });
    }

    await Promise.all([run(), run()]);
    assert.equal(state.sends, 1);
    assert.equal(state.edits, 1);
  });
});
