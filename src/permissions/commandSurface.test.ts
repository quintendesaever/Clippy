import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionFlagsBits } from "discord.js";
import command from "../commands/permissions.js";

describe("/permissions command surface", () => {
  it("registers four Manage Server-gated guild-only subcommands", () => {
    const json = command.data.toJSON();
    assert.equal(json.name, "permissions");
    assert.equal(json.dm_permission, false);
    assert.equal(json.default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
    const names = (json.options ?? []).map((option) => option.name).sort();
    assert.deepEqual(names, ["audit", "channel", "role", "user"]);
    assert.equal(typeof command.execute, "function");
  });
});
