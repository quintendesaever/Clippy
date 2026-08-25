import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUuid, readCookie, resolveAnalyticsSessionId } from "./session.js";

describe("analytics session cookie", () => {
  it("reuses a valid uuid cookie", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const resolved = resolveAnalyticsSessionId(`clippy_vid=${id}; clippy_session=abc`);
    assert.equal(resolved.sessionId, id);
    assert.equal(resolved.isNew, false);
  });

  it("creates a new id when missing or invalid", () => {
    const missing = resolveAnalyticsSessionId(undefined);
    assert.equal(missing.isNew, true);
    assert.equal(isUuid(missing.sessionId), true);

    const invalid = resolveAnalyticsSessionId("clippy_vid=not-a-uuid");
    assert.equal(invalid.isNew, true);
    assert.equal(isUuid(invalid.sessionId), true);
  });

  it("parses cookies without matching the session cookie", () => {
    assert.equal(readCookie("a=1; b=2", "b"), "2");
    assert.equal(readCookie("a=1", "clippy_vid"), undefined);
  });
});
