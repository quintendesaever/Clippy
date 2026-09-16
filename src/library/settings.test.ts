import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLibrarySettingsPatch } from "./settingsPatch.js";
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
