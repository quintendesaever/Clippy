import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionFlagsBits } from "discord.js";
import { evaluateAudit } from "./evaluate.js";
import { CLIPPY_SERVER_POLICY, classifyRole } from "./serverPolicy.js";
import type { ChannelSnapshot, GuildSnapshot, OverwriteSnapshot, RoleSnapshot } from "./types.js";

const GUILD_ID = "guild-1";
const PIN_ROLE_ID = CLIPPY_SERVER_POLICY.pinExpectedRoleIds[0];

function role(partial: Partial<RoleSnapshot> & Pick<RoleSnapshot, "id" | "name">): RoleSnapshot {
  return {
    position: 1,
    permissions: 0n,
    managed: false,
    mentionable: false,
    editable: true,
    ...partial,
  };
}

function ow(
  id: string,
  type: OverwriteSnapshot["type"],
  allow: bigint = 0n,
  deny: bigint = 0n
): OverwriteSnapshot {
  return { id, type, allow, deny };
}

function channel(partial: Partial<ChannelSnapshot> & Pick<ChannelSnapshot, "id" | "name">): ChannelSnapshot {
  return {
    kind: "text",
    parentId: null,
    permissionsLocked: null,
    overwrites: [],
    ...partial,
  };
}

function everyone(permissions = 0n): RoleSnapshot {
  return role({ id: GUILD_ID, name: "@everyone", position: 0, permissions });
}

function pinRole(permissions: bigint = PermissionFlagsBits.PinMessages): RoleSnapshot {
  return role({ id: PIN_ROLE_ID, name: "Indie", position: 2, permissions });
}

function guild(partial: Partial<GuildSnapshot> = {}): GuildSnapshot {
  return {
    id: GUILD_ID,
    name: "Clippy Test",
    roles: [everyone(), pinRole()],
    channels: [],
    bot: { memberId: "bot-1", highestRolePosition: 8, resolved: true },
    rolesFetchIncomplete: false,
    channelsFetchIncomplete: false,
    ...partial,
  };
}

function codes(result: ReturnType<typeof evaluateAudit>, severity?: "fail" | "warn" | "ok"): string[] {
  return result.findings
    .filter((finding) => (severity ? finding.severity === severity : true))
    .map((finding) => finding.code);
}

function finding(result: ReturnType<typeof evaluateAudit>, code: string) {
  return result.findings.find((entry) => entry.code === code);
}

describe("role classification", () => {
  it("treats staff names and Admin ( prefix as staff, managed bots as managed", () => {
    assert.equal(classifyRole(role({ id: "1", name: "Owner" }), GUILD_ID), "staff");
    assert.equal(classifyRole(role({ id: "2", name: "Admin" }), GUILD_ID), "staff");
    assert.equal(classifyRole(role({ id: "3", name: "Mod" }), GUILD_ID), "staff");
    assert.equal(classifyRole(role({ id: "4", name: "Assistant" }), GUILD_ID), "staff");
    assert.equal(classifyRole(role({ id: "5", name: "Admin (temp)" }), GUILD_ID), "staff");
    assert.equal(classifyRole(role({ id: "6", name: "Clippy", managed: true }), GUILD_ID), "managed");
    assert.equal(classifyRole(role({ id: "7", name: "────" }), GUILD_ID), "decorative");
    assert.equal(classifyRole(everyone(), GUILD_ID), "everyone");
    assert.equal(classifyRole(role({ id: "8", name: "Indie" }), GUILD_ID), "human");
  });
});

describe("evaluateAudit failures", () => {
  it("flags @everyone MentionEveryone as incorrect", () => {
    const result = evaluateAudit(
      guild({
        roles: [everyone(PermissionFlagsBits.MentionEveryone), pinRole()],
      })
    );
    assert.equal(finding(result, "everyone_high_risk_base")?.severity, "fail");
    assert.match(finding(result, "everyone_high_risk_base")!.detail, /Mention Everyone/);
    assert.ok(!codes(result, "ok").includes("everyone_base_clean"));
  });

  it("flags an @everyone channel Manage Channels allow as incorrect", () => {
    const result = evaluateAudit(
      guild({
        channels: [
          channel({
            id: "welcome",
            name: "welcome",
            overwrites: [ow(GUILD_ID, "role", PermissionFlagsBits.ManageChannels)],
          }),
        ],
      })
    );
    assert.equal(finding(result, "everyone_high_risk_overwrite")?.severity, "fail");
    assert.match(finding(result, "everyone_high_risk_overwrite")!.detail, /Manage Channels/);
    assert.match(finding(result, "everyone_high_risk_overwrite")!.detail, /welcome/);
  });

  it("flags an unmanaged non-staff elevated role as incorrect", () => {
    const result = evaluateAudit(
      guild({
        roles: [
          everyone(),
          pinRole(),
          role({ id: "student", name: "Student", permissions: PermissionFlagsBits.ManageMessages }),
        ],
      })
    );
    assert.equal(finding(result, "human_elevated")?.severity, "fail");
    assert.match(finding(result, "human_elevated")!.detail, /Student/);
  });

  it("does not treat staff or managed bot Administrator as a human-role failure", () => {
    const result = evaluateAudit(
      guild({
        roles: [
          everyone(),
          pinRole(),
          role({ id: "admin", name: "Admin", permissions: PermissionFlagsBits.Administrator, position: 20 }),
          role({
            id: "clippy",
            name: "Clippy",
            managed: true,
            permissions: PermissionFlagsBits.Administrator,
            position: 3,
          }),
          role({ id: "temp", name: "Admin (Quinten)", permissions: PermissionFlagsBits.ManageGuild, position: 19 }),
        ],
      })
    );
    assert.ok(!codes(result).includes("human_elevated"));
    assert.equal(finding(result, "managed_elevated")?.severity, "warn");
    assert.match(finding(result, "managed_elevated")!.detail, /Clippy/);
  });

  it("reports expected Pin Messages present and missing", () => {
    const present = evaluateAudit(guild());
    assert.equal(finding(present, "pin_present")?.severity, "ok");

    const missing = evaluateAudit(
      guild({
        roles: [everyone(), pinRole(0n)],
      })
    );
    assert.equal(finding(missing, "pin_missing")?.severity, "fail");
    assert.ok(!codes(missing).includes("pin_present"));
  });
});

describe("evaluateAudit warnings and expected aggregates", () => {
  it("warns when duplicate normalized role names differ on Pin Messages", () => {
    const result = evaluateAudit(
      guild({
        roles: [
          everyone(),
          pinRole(),
          role({ id: "indie-2", name: "Indie", permissions: 0n, position: 3 }),
        ],
      })
    );
    assert.equal(finding(result, "duplicate_role_name")?.severity, "warn");
    assert.match(finding(result, "duplicate_role_name")!.detail, /Indie/);
  });

  it("warns on a member-specific View Channel overwrite", () => {
    const result = evaluateAudit(
      guild({
        channels: [
          channel({
            id: "secret",
            name: "secret",
            overwrites: [ow("user-9", "member", PermissionFlagsBits.ViewChannel)],
          }),
        ],
      })
    );
    assert.equal(finding(result, "member_overwrite")?.severity, "warn");
    assert.match(finding(result, "member_overwrite")!.detail, /user-9/);
  });

  it("aggregates synced / consistent siblings as expected", () => {
    const parentOw = [ow(GUILD_ID, "role", 0n, PermissionFlagsBits.ViewChannel)];
    const result = evaluateAudit(
      guild({
        channels: [
          channel({ id: "cat", name: "courses", kind: "category", overwrites: parentOw }),
          channel({
            id: "a",
            name: "course-a",
            parentId: "cat",
            permissionsLocked: true,
            overwrites: parentOw,
          }),
          channel({
            id: "b",
            name: "course-b",
            parentId: "cat",
            permissionsLocked: true,
            overwrites: parentOw,
          }),
        ],
      })
    );
    assert.ok(codes(result, "ok").includes("children_synced"));
    assert.ok(codes(result, "ok").includes("siblings_consistent"));
    assert.ok(!codes(result).includes("sibling_divergence"));
    assert.ok(!codes(result).includes("unsynced_child"));
  });

  it("warns once when sibling overwrite maps diverge", () => {
    const result = evaluateAudit(
      guild({
        channels: [
          channel({ id: "cat", name: "staff", kind: "category" }),
          channel({
            id: "a",
            name: "staff-a",
            parentId: "cat",
            permissionsLocked: false,
            overwrites: [ow("mod", "role", PermissionFlagsBits.ViewChannel)],
          }),
          channel({
            id: "b",
            name: "staff-b",
            parentId: "cat",
            permissionsLocked: false,
            overwrites: [ow("admin", "role", PermissionFlagsBits.ViewChannel)],
          }),
        ],
        roles: [
          everyone(),
          pinRole(),
          role({ id: "mod", name: "Mod", position: 10 }),
          role({ id: "admin", name: "Admin", position: 11 }),
        ],
      })
    );
    assert.equal(finding(result, "sibling_divergence")?.severity, "warn");
    assert.equal(result.findings.filter((entry) => entry.code === "sibling_divergence").length, 1);
    assert.equal(finding(result, "unsynced_child")?.severity, "warn");
  });

  it("does not blanket-warn a course category deny plus matching course role View Channel allow", () => {
    const result = evaluateAudit(
      guild({
        roles: [everyone(), pinRole(), role({ id: "visitor", name: "Visitor", position: 4 })],
        channels: [
          channel({
            id: "indie-cat",
            name: "Indie",
            kind: "category",
            overwrites: [
              ow(GUILD_ID, "role", 0n, PermissionFlagsBits.ViewChannel),
              ow(PIN_ROLE_ID, "role", PermissionFlagsBits.ViewChannel),
              ow("visitor", "role", PermissionFlagsBits.ViewChannel),
            ],
          }),
        ],
      })
    );
    const undone = finding(result, "deny_undone");
    assert.ok(undone);
    assert.match(undone!.detail, /Visitor/);
    assert.doesNotMatch(undone!.detail, /@Indie/);
  });

  it("notes bot hierarchy limits and an unresolved bot member", () => {
    const hierarchy = evaluateAudit(
      guild({
        roles: [
          everyone(),
          pinRole(),
          role({ id: "owner", name: "Owner", position: 20, permissions: PermissionFlagsBits.Administrator }),
        ],
        bot: { memberId: "bot-1", highestRolePosition: 8, resolved: true },
      })
    );
    assert.equal(finding(hierarchy, "bot_hierarchy")?.severity, "warn");
    assert.match(finding(hierarchy, "bot_hierarchy")!.detail, /Owner/);
    assert.ok(codes(hierarchy, "ok").includes("inspection_ok"));

    const unresolved = evaluateAudit(
      guild({
        bot: { memberId: null, highestRolePosition: null, resolved: false },
      })
    );
    assert.equal(finding(unresolved, "bot_member_unresolved")?.severity, "warn");
    assert.ok(!codes(unresolved, "ok").includes("inspection_ok"));
  });

  it("warns when role or channel fetch was incomplete", () => {
    const result = evaluateAudit(guild({ rolesFetchIncomplete: true, channelsFetchIncomplete: true }));
    assert.equal(finding(result, "incomplete_fetch")?.severity, "warn");
    assert.match(finding(result, "incomplete_fetch")!.detail, /roles and channels/);
  });

  it("sorts failures before warnings", () => {
    const result = evaluateAudit(
      guild({
        roles: [everyone(PermissionFlagsBits.MentionEveryone), pinRole(0n)],
        channels: [
          channel({
            id: "welcome",
            name: "welcome",
            overwrites: [ow(GUILD_ID, "role", PermissionFlagsBits.ManageChannels)],
          }),
        ],
        bot: { memberId: null, highestRolePosition: null, resolved: false },
      })
    );
    const severities = result.findings.map((entry) => entry.severity);
    const firstWarn = severities.indexOf("warn");
    const lastFail = severities.lastIndexOf("fail");
    assert.ok(lastFail >= 0 && firstWarn >= 0);
    assert.ok(lastFail < firstWarn);
  });
});
