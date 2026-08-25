import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionFlagsBits } from "discord.js";
import { memberHasAdminPermission } from "./adminAuth.js";

describe("memberHasAdminPermission", () => {
  it("allows ManageGuild", () => {
    assert.equal(
      memberHasAdminPermission({
        has: (flag) => flag === PermissionFlagsBits.ManageGuild,
      }),
      true
    );
  });

  it("rejects members without ManageGuild", () => {
    assert.equal(memberHasAdminPermission({ has: () => false }), false);
    assert.equal(memberHasAdminPermission(null), false);
    assert.equal(memberHasAdminPermission(undefined), false);
  });
});
