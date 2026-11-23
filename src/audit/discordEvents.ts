import type { Client } from "discord.js";
import { logMemberJoin, logRoleCreate, logRoleDelete, logRoleUpdate, logChannelCreate, logChannelDelete, logChannelUpdate } from "./events.js";

export function registerAuditEvents(client: Client, guildId: string): void {
  client.on("guildMemberAdd", (member) => {
    if (member.guild.id !== guildId) return;
    void logMemberJoin(client, member);
  });

  client.on("roleCreate", (role) => {
    if (role.guild.id !== guildId) return;
    void logRoleCreate(client, role);
  });

  client.on("roleDelete", (role) => {
    if (role.guild.id !== guildId) return;
    void logRoleDelete(client, role);
  });

  client.on("roleUpdate", (oldRole, newRole) => {
    if (newRole.guild.id !== guildId) return;
    void logRoleUpdate(client, oldRole, newRole);
  });

  client.on("channelCreate", (channel) => {
    if (!("guild" in channel) || channel.guild.id !== guildId) return;
    void logChannelCreate(client, channel);
  });

  client.on("channelDelete", (channel) => {
    if (!("guild" in channel) || channel.guild.id !== guildId) return;
    void logChannelDelete(client, channel);
  });

  client.on("channelUpdate", (oldChannel, newChannel) => {
    if (!("guild" in newChannel) || newChannel.guild.id !== guildId) return;
    if (!("guild" in oldChannel)) return;
    void logChannelUpdate(client, oldChannel, newChannel);
  });
}
