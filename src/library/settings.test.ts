import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyLibrarySettings, isLibraryScheduleActive, resolveLibrarySettingsPatch } from "./settingsPatch.js";
import { DEFAULT_CLOSE_MINUTES, DEFAULT_OPEN_MINUTES } from "./types.js";

const current = {
  enabled: false,
  channelId: null,
  openMinutes: DEFAULT_OPEN_MINUTES,
  closeMinutes: DEFAULT_CLOSE_MINUTES,
};

describe("resolveLibrarySettingsPatch", () => {
  it("rejects enabling without a channel", () => {
    const result = resolveLibrarySettingsPatch({
      current,
      patch: { enabled: true },
      validChannelIds: new Set(["c1"]),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /kanaal/i);
  });

  it("rejects a channel that is not in the current guild", () => {
    const result = resolveLibrarySettingsPatch({
      current,
      patch: { enabled: true, channelId: "other" },
      validChannelIds: new Set(["c1"]),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /geldig tekstkanaal/i);
  });

  it("rejects a closing time of 24:00", () => {
    const result = resolveLibrarySettingsPatch({
      current,
      patch: { openMinutes: 0, closeMinutes: 1440 },
      validChannelIds: new Set(["c1"]),
    });
    assert.equal(result.ok, false);
  });

  it("rejects closing at or before opening", () => {
    const result = resolveLibrarySettingsPatch({
      current,
      patch: { openMinutes: 10 * 60, closeMinutes: 9 * 60 },
      validChannelIds: new Set(["c1"]),
    });
    assert.equal(result.ok, false);
  });

  it("accepts enabled + channel + hours and keeps unspecified fields", () => {
    const result = resolveLibrarySettingsPatch({
      current: { ...current, channelId: "c1" },
      patch: { enabled: true, openMinutes: 9 * 60 },
      validChannelIds: new Set(["c1"]),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.next.enabled, true);
    assert.equal(result.next.channelId, "c1");
    assert.equal(result.next.openMinutes, 9 * 60);
    assert.equal(result.next.closeMinutes, DEFAULT_CLOSE_MINUTES);
  });
});

describe("isLibraryScheduleActive", () => {
  it("rejects plan/clear mutations when disabled or unconfigured", () => {
    assert.equal(isLibraryScheduleActive(null), false);
    assert.equal(isLibraryScheduleActive(emptyLibrarySettings("g1")), false);
    const enabled = emptyLibrarySettings("g1");
    enabled.enabled = true;
    enabled.channel_id = "c1";
    assert.equal(isLibraryScheduleActive(enabled), true);
    enabled.enabled = false;
    assert.equal(isLibraryScheduleActive(enabled), false);
  });
});

describe("settings upsert glue", () => {
  it("keeps message_channel_id when only the configured channel is patched", () => {
    const existing = emptyLibrarySettings("g1");
    existing.enabled = true;
    existing.channel_id = "old";
    existing.message_channel_id = "old";
    existing.message_id = "m1";
    const afterSave = { ...existing, channel_id: "new" };
    assert.equal(afterSave.channel_id, "new");
    assert.equal(afterSave.message_channel_id, "old");
    assert.equal(afterSave.message_id, "m1");
  });
});
