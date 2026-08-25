import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUserAgent } from "./ua.js";

describe("parseUserAgent", () => {
  it("detects desktop Chrome", () => {
    const parsed = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    assert.equal(parsed.deviceType, "desktop");
    assert.equal(parsed.browserFamily, "Chrome");
  });

  it("detects iPhone Safari", () => {
    const parsed = parseUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );
    assert.equal(parsed.deviceType, "mobile");
    assert.equal(parsed.browserFamily, "Safari");
  });

  it("detects iPad as tablet", () => {
    const parsed = parseUserAgent(
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );
    assert.equal(parsed.deviceType, "tablet");
  });

  it("handles missing UA", () => {
    assert.deepEqual(parseUserAgent(undefined), { deviceType: "unknown", browserFamily: null });
  });
});
