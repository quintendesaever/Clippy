import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseActivitySummary } from "./eventUtils.js";

describe("parseActivitySummary", () => {
  it("joins dual-code project titles and strips leftover slashes", () => {
    const parsed = parseActivitySummary(
      "EWI3615TU / TI3715TU - Computer Science Project / Game Development Project"
    );
    assert.equal(parsed.title, "Computer Science Game Development");
    assert.deepEqual(parsed.typeBadges, ["J"]);
  });

  it("keeps a simple course name after stripping type and code", () => {
    const parsed = parseActivitySummary("CSE1500 - Hoorcollege Calculus");
    assert.equal(parsed.title, "Calculus");
    assert.deepEqual(parsed.typeBadges, ["H"]);
  });

  it("strips every type word, not only the first", () => {
    const parsed = parseActivitySummary("Hoorcollege Algebra hoorcollege");
    assert.equal(parsed.title, "Algebra");
    assert.deepEqual(parsed.typeBadges, ["H"]);
  });
});
