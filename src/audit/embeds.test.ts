import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAuditEmbed, sanitizeAuditText, AUDIT_COLORS } from "./embeds.js";
import type { AuditEvent } from "./types.js";

describe("sanitizeAuditText", () => {
  it("redacts tokens, credentialed URLs, and keeps a short message", () => {
    assert.match(sanitizeAuditText("Bearer super-secret-token failed"), /\[redacted\]/);
    assert.doesNotMatch(sanitizeAuditText("Bearer super-secret-token failed"), /super-secret-token/);
    assert.match(
      sanitizeAuditText("Could not fetch https://user:pass@example.com/ics"),
      /\[redacted\]/
    );
    assert.doesNotMatch(
      sanitizeAuditText("password=hunter2 boom"),
      /hunter2/
    );
  });

  it("strips stack traces to the first line", () => {
    const text = sanitizeAuditText("boom\n    at foo (src/index.ts:1:1)\n    at bar");
    assert.equal(text, "boom");
    assert.doesNotMatch(text, /index\.ts/);
  });
});

describe("buildAuditEmbed", () => {
  it("sets title, color, footer, and member/target fields", () => {
    const event: AuditEvent = {
      guildId: "g1",
      category: "members",
      title: "Member joined",
      severity: "success",
      actor: { id: "u1", tag: "alice" },
      target: "unused-for-join",
      details: "Welcome",
    };
    const embed = buildAuditEmbed(event).toJSON();
    assert.equal(embed.title, "Member joined");
    assert.equal(embed.color, AUDIT_COLORS.success);
    assert.equal(embed.footer?.text, "Clippy audit");
    assert.ok(embed.fields?.some((field) => field.name === "Member" && field.value.includes("u1")));
    assert.ok(embed.fields?.some((field) => field.name === "Target"));
    assert.ok(embed.fields?.some((field) => field.name === "Details" && field.value === "Welcome"));
    assert.ok(embed.timestamp);
  });

  it("uses error color for command failures and never embeds a stack", () => {
    const embed = buildAuditEmbed({
      guildId: "g1",
      category: "command_errors",
      title: "Command failed",
      severity: "error",
      target: "/stats",
      details: "ECONNRESET\n    at processTicksAndRejections",
    }).toJSON();
    assert.equal(embed.color, AUDIT_COLORS.error);
    const details = embed.fields?.find((field) => field.name === "Details")?.value ?? "";
    assert.equal(details, "ECONNRESET");
    assert.doesNotMatch(details, /processTicks/);
  });
});
