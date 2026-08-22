import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactLocationFromDescription } from "./eventMeta.js";

describe("redactLocationFromDescription", () => {
  it("strips room codes when location is hidden", () => {
    const redacted = redactLocationFromDescription("Notes\nB22.0.10\nBring laptop");
    assert.ok(redacted);
    assert.equal(redacted?.includes("B22.0.10"), false);
    assert.ok(redacted?.includes("Bring laptop"));
  });

  it("still strips Location headings", () => {
    const redacted = redactLocationFromDescription("Locatie: Campus Sterre\nHello");
    assert.ok(redacted);
    assert.equal(redacted?.includes("Campus Sterre"), false);
  });
});
