import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileTimetablePanel, type ReconcileDiscord } from "./timetablePanelReconcile.js";
import { getVisibleTimetableDayKeys } from "./timetableVisibility.js";
import { makeEvent, makeTimetable } from "./timetableTestFixtures.js";

function fakeDiscord(options: {
  exists?: boolean;
  editResult?: "ok" | "missing";
}): ReconcileDiscord & {
  edits: number;
  sends: number;
  pins: number;
} {
  const state = { edits: 0, sends: 0, pins: 0 };
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
    async fetchMessage() {
      return options.exists !== false;
    },
    async editMessage() {
      state.edits += 1;
      return options.editResult ?? "ok";
    },
    async sendMessage(channelId) {
      state.sends += 1;
      return { channelId, messageId: "new-msg" };
    },
    async pinMessage() {
      state.pins += 1;
    },
  };
}

describe("reconcileTimetablePanel", () => {
  it("creates when no panel is stored and does not send a second message", async () => {
    const discord = fakeDiscord({});
    const result = await reconcileTimetablePanel({
      guildId: "g1",
      invokeChannelId: "c1",
      stored: null,
      weekKey: "2026-08-17",
      discord,
    });
    assert.equal(result.action, "created");
    assert.equal(discord.sends, 0);
    assert.equal(discord.edits, 0);
  });

  it("updates the stored panel instead of creating a duplicate", async () => {
    const discord = fakeDiscord({ exists: true, editResult: "ok" });
    const result = await reconcileTimetablePanel({
      guildId: "g1",
      invokeChannelId: "c2",
      stored: { guildId: "g1", channelId: "c1", messageId: "m1", weekKey: "2026-08-10" },
      weekKey: "2026-08-17",
      discord,
    });
    assert.equal(result.action, "updated");
    if (result.action !== "updated") return;
    assert.equal(result.panel.messageId, "m1");
    assert.equal(result.panel.channelId, "c1");
    assert.equal(result.panel.weekKey, "2026-08-17");
    assert.equal(discord.edits, 1);
    assert.equal(discord.sends, 0);
    assert.equal(discord.pins, 0);
  });

  it("recreates in the invoke channel when the Discord message is gone", async () => {
    const discord = fakeDiscord({ exists: false });
    const result = await reconcileTimetablePanel({
      guildId: "g1",
      invokeChannelId: "c2",
      stored: { guildId: "g1", channelId: "c1", messageId: "m1", weekKey: "2026-08-17" },
      weekKey: "2026-08-17",
      discord,
    });
    assert.equal(result.action, "recreated");
    if (result.action !== "recreated") return;
    assert.equal(result.panel.channelId, "c2");
    assert.equal(result.panel.messageId, "new-msg");
    assert.equal(discord.sends, 1);
    assert.equal(discord.pins, 1);
    assert.equal(discord.edits, 0);
  });

  it("recreates when editing reports the message is missing", async () => {
    const discord = fakeDiscord({ exists: true, editResult: "missing" });
    const result = await reconcileTimetablePanel({
      guildId: "g1",
      invokeChannelId: "c1",
      stored: { guildId: "g1", channelId: "c1", messageId: "m1", weekKey: "2026-08-17" },
      weekKey: "2026-08-17",
      discord,
    });
    assert.equal(result.action, "recreated");
    assert.equal(discord.sends, 1);
    assert.equal(discord.pins, 1);
  });
});

describe("getVisibleTimetableDayKeys", () => {
  it("hides empty weekend days and keeps Saturday when Sunday has events", () => {
    const weekdaysOnly = makeTimetable([makeEvent()]);
    assert.deepEqual(getVisibleTimetableDayKeys(weekdaysOnly), [
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
    ]);

    const sunday = makeTimetable([
      makeEvent({
        start: new Date("2026-08-23T10:00:00.000Z"),
        end: new Date("2026-08-23T12:00:00.000Z"),
      }),
    ]);
    assert.deepEqual(getVisibleTimetableDayKeys(sunday), [
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ]);
  });
});
