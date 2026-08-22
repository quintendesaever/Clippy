import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePredictionUrl } from "./predictionUrl.js";

describe("resolvePredictionUrl", () => {
  it("prefers the guild setting over the env fallback", () => {
    assert.equal(
      resolvePredictionUrl("https://guild.example/predict", "https://env.example/predict"),
      "https://guild.example/predict"
    );
  });

  it("uses the env fallback when the guild setting is empty", () => {
    assert.equal(resolvePredictionUrl("  ", "https://env.example/predict"), "https://env.example/predict");
  });

  it("returns null for missing, localhost, or invalid URLs", () => {
    assert.equal(resolvePredictionUrl(null, undefined), null);
    assert.equal(resolvePredictionUrl("https://localhost/predict", null), null);
    assert.equal(resolvePredictionUrl("not-a-url", null), null);
    assert.equal(resolvePredictionUrl("ftp://example.com/predict", null), null);
  });
});
