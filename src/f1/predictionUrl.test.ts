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

  it("returns null for missing, localhost names, or invalid URLs", () => {
    assert.equal(resolvePredictionUrl(null, undefined), null);
    assert.equal(resolvePredictionUrl("https://localhost/predict", null), null);
    assert.equal(resolvePredictionUrl("https://foo.localhost/predict", null), null);
    // FQDN trailing-dot form must not bypass localhost checks
    assert.equal(resolvePredictionUrl("http://localhost./", null), null);
    assert.equal(resolvePredictionUrl("https://localhost./", null), null);
    assert.equal(resolvePredictionUrl("not-a-url", null), null);
    assert.equal(resolvePredictionUrl("ftp://example.com/predict", null), null);
  });

  it("allows legitimate public HTTP(S) URLs", () => {
    assert.equal(
      resolvePredictionUrl("https://example.com/predict", null),
      "https://example.com/predict"
    );
    assert.equal(
      resolvePredictionUrl("http://predictions.example.org/path?x=1", null),
      "http://predictions.example.org/path?x=1"
    );
  });

  it("rejects loopback IPv4 addresses", () => {
    assert.equal(resolvePredictionUrl("https://127.0.0.1/predict", null), null);
    assert.equal(resolvePredictionUrl("https://127.1.2.3/predict", null), null);
  });

  it("rejects private IPv4 addresses including signed-mask edge ranges", () => {
    // 10/8 (high bit clear — already worked before the signed-int32 fix)
    assert.equal(resolvePredictionUrl("https://10.0.0.1/predict", null), null);
    assert.equal(resolvePredictionUrl("https://10.0.0.5/predict", null), null);
    // 172.16/12 — previously broken by signed int32 mask comparison
    assert.equal(resolvePredictionUrl("https://172.16.4.2/predict", null), null);
    assert.equal(resolvePredictionUrl("https://172.31.255.255/predict", null), null);
    // 192.168/16 — previously broken
    assert.equal(resolvePredictionUrl("https://192.168.1.10/predict", null), null);
    assert.equal(resolvePredictionUrl("https://192.168.255.255/predict", null), null);
  });

  it("rejects link-local and metadata IPv4 addresses", () => {
    assert.equal(resolvePredictionUrl("https://169.254.169.254/latest", null), null);
    assert.equal(resolvePredictionUrl("http://169.254.1.1/", null), null);
  });

  it("rejects unspecified IPv4", () => {
    assert.equal(resolvePredictionUrl("https://0.0.0.0/predict", null), null);
  });

  it("rejects loopback, link-local, and unique-local IPv6", () => {
    assert.equal(resolvePredictionUrl("https://[::1]/predict", null), null);
    assert.equal(resolvePredictionUrl("https://[fe80::1]/predict", null), null);
    assert.equal(resolvePredictionUrl("https://[fc00::1]/predict", null), null);
    assert.equal(resolvePredictionUrl("https://[fd12:3456:789a::1]/predict", null), null);
    assert.equal(resolvePredictionUrl("https://[::]/predict", null), null);
  });

  it("rejects IPv4-mapped private/loopback IPv6 forms", () => {
    assert.equal(resolvePredictionUrl("https://[::ffff:127.0.0.1]/predict", null), null);
    assert.equal(resolvePredictionUrl("https://[::ffff:10.0.0.1]/predict", null), null);
    assert.equal(resolvePredictionUrl("https://[::ffff:172.16.0.1]/predict", null), null);
    assert.equal(resolvePredictionUrl("https://[::ffff:192.168.0.1]/predict", null), null);
    assert.equal(resolvePredictionUrl("https://[::ffff:169.254.169.254]/predict", null), null);
    // Parser may normalize dotted-quad mapped form to hex groups
    assert.equal(resolvePredictionUrl("https://[::ffff:c0a8:1]/predict", null), null);
  });

  it("rejects IPv4-translated private/loopback IPv6 forms", () => {
    // ::ffff:0:a.b.c.d — Node may normalize to ::ffff:0:XXXX:YYYY
    assert.equal(resolvePredictionUrl("https://[::ffff:0:192.168.0.1]/predict", null), null);
    assert.equal(resolvePredictionUrl("https://[::ffff:0:127.0.0.1]/predict", null), null);
    assert.equal(resolvePredictionUrl("https://[::ffff:0:c0a8:1]/predict", null), null);
    assert.equal(resolvePredictionUrl("https://[::ffff:0:7f00:1]/predict", null), null);
  });

  it("allows ordinary public IPv6 destinations", () => {
    assert.equal(
      resolvePredictionUrl("https://[2001:4860:4860::8888]/predict", null),
      "https://[2001:4860:4860::8888]/predict"
    );
  });
});
