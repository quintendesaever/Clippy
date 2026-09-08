import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  looksLikeSnowflake,
  payloadHasUnresolvedNames,
  resolveMemberDisplayName,
  UNKNOWN_MEMBER_NAME,
} from "./memberName.js";

describe("looksLikeSnowflake", () => {
  it("detects Discord snowflakes", () => {
    assert.equal(looksLikeSnowflake("1027537387930263562"), true);
    assert.equal(looksLikeSnowflake("Wout"), false);
    assert.equal(looksLikeSnowflake(null), false);
  });
});

describe("resolveMemberDisplayName", () => {
  it("prefers a real display name over initials and never returns a snowflake", () => {
    assert.equal(
      resolveMemberDisplayName({
        userId: "1027537387930263562",
        displayName: "Wout",
        initials: "W",
      }),
      "Wout"
    );
    assert.equal(
      resolveMemberDisplayName({
        userId: "1027537387930263562",
        displayName: "1027537387930263562",
        initials: "AN",
      }),
      "AN"
    );
    assert.equal(
      resolveMemberDisplayName({
        userId: "1027537387930263562",
        username: "andreas",
      }),
      "andreas"
    );
    assert.equal(
      resolveMemberDisplayName({ userId: "1027537387930263562" }),
      UNKNOWN_MEMBER_NAME
    );
  });
});

describe("payloadHasUnresolvedNames", () => {
  it("flags snowflake display names", () => {
    assert.equal(
      payloadHasUnresolvedNames(["Wout", "1027537387930263562"], ["1", "1027537387930263562"]),
      true
    );
    assert.equal(payloadHasUnresolvedNames(["Wout", "Andreas"], ["1", "2"]), false);
  });
});
