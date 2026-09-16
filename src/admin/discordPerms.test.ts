import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DiscordAPIError, PermissionFlagsBits, RESTJSONErrorCodes } from "discord.js";
import {
  GUILD_ONLY_REPLY,
  MISSING_PERMISSIONS_REPLY,
  formatDiscordApiError,
  hasRequiredPermissions,
  messageForDiscordErrorCode,
  missingBotPermissionMessage,
  missingUserPermissionMessage,
  requireGuild,
} from "./discordPerms.js";

describe("requireGuild", () => {
  it("rejects DM / missing guild", () => {
    assert.deepEqual(requireGuild({ guild: null, guildId: null }), {
      ok: false,
      message: GUILD_ONLY_REPLY,
    });
  });

  it("accepts a guild interaction", () => {
    const guild = { id: "g1" };
    const result = requireGuild({ guild: guild as never, guildId: "g1" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.guildId, "g1");
      assert.equal(result.guild, guild);
    }
  });
});

describe("hasRequiredPermissions", () => {
  it("fails closed when permissions are missing", () => {
    assert.equal(hasRequiredPermissions(null, [PermissionFlagsBits.ManageMessages]), false);
    assert.equal(hasRequiredPermissions(undefined, [PermissionFlagsBits.ManageGuild], "any"), false);
  });

  it("checks all vs any", () => {
    const perms = {
      has(bit: bigint) {
        return bit === PermissionFlagsBits.ManageRoles;
      },
    };
    assert.equal(
      hasRequiredPermissions(perms, [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels], "any"),
      true
    );
    assert.equal(
      hasRequiredPermissions(perms, [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels], "all"),
      false
    );
    assert.equal(hasRequiredPermissions(perms, [PermissionFlagsBits.ManageChannels], "any"), false);
  });
});

describe("permission copy", () => {
  it("names the missing user and bot permission", () => {
    assert.equal(
      missingUserPermissionMessage("Manage Messages"),
      "You need **Manage Messages** to use this command."
    );
    assert.equal(
      missingBotPermissionMessage("Manage Messages"),
      "I need **Manage Messages** in this channel to do that."
    );
  });
});

describe("formatDiscordApiError", () => {
  it("maps Missing Permissions (50013) to short copy", () => {
    assert.equal(messageForDiscordErrorCode(50013), MISSING_PERMISSIONS_REPLY);
    assert.equal(messageForDiscordErrorCode(RESTJSONErrorCodes.MissingPermissions), MISSING_PERMISSIONS_REPLY);
    assert.equal(messageForDiscordErrorCode(50001), null);

    const err = Object.create(DiscordAPIError.prototype) as DiscordAPIError;
    err.code = RESTJSONErrorCodes.MissingPermissions;
    assert.equal(formatDiscordApiError(err), MISSING_PERMISSIONS_REPLY);
    assert.equal(formatDiscordApiError(new Error("nope")), null);
  });
});
