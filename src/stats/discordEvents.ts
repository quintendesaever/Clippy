import type { Client } from "discord.js";
import { handleMessageCreate, softDeleteMessage, handleMessageReactionAdd, handleMessageReactionRemove, handleVoiceStateJoin, handleVoiceStateLeave } from "./liveHandlers.js";

export function registerStatsEvents(client: Client, guildId: string): void {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guildId) return;
    if (message.guildId !== guildId) return;
    handleMessageCreate(message).catch((err) => console.error("stats: messageCreate:", err));
  });

  client.on("messageDelete", async (message) => {
    let resolvedGuildId: string | null | undefined = message.guildId ?? undefined;
    if (!resolvedGuildId && message.channel && "guildId" in message.channel) {
      resolvedGuildId = (message.channel as { guildId?: string }).guildId;
    }
    if (!resolvedGuildId && message.channel) {
      const ch = await client.channels.fetch(message.channelId).catch(() => null);
      if (ch && !("isDMBased" in ch && ch.isDMBased()))
        resolvedGuildId = (ch as { guildId: string }).guildId;
    }
    if (!resolvedGuildId || resolvedGuildId !== guildId) return;
    softDeleteMessage(resolvedGuildId, message.channelId, message.id).catch((err) =>
      console.error("stats: messageDelete:", err)
    );
  });

  client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;
    handleMessageReactionAdd(reaction).catch((err) =>
      console.error("stats: messageReactionAdd:", err)
    );
  });

  client.on("messageReactionRemove", async (reaction, user) => {
    if (user.bot) return;
    handleMessageReactionRemove(reaction).catch((err) =>
      console.error("stats: messageReactionRemove:", err)
    );
  });

  client.on("messageDeleteBulk", async (messages) => {
    const first = messages.first();
    if (!first) return;
    let resolvedGuildId: string | null | undefined = first.guildId ?? undefined;
    if (!resolvedGuildId && first.channel && "guildId" in first.channel) {
      resolvedGuildId = (first.channel as { guildId?: string }).guildId;
    }
    if (!resolvedGuildId) {
      const ch = await client.channels.fetch(first.channelId).catch(() => null);
      if (ch && !("isDMBased" in ch && ch.isDMBased()))
        resolvedGuildId = (ch as { guildId: string }).guildId;
    }
    if (!resolvedGuildId || resolvedGuildId !== guildId) return;
    const channelId = first.channelId;
    for (const msg of messages.values()) {
      softDeleteMessage(resolvedGuildId, channelId, msg.id).catch((err) =>
        console.error("stats: messageBulkDelete:", err)
      );
    }
  });

  client.on("voiceStateUpdate", async (oldState, newState) => {
    const stateGuildId = newState.guild?.id ?? oldState.guild?.id;
    const userId = newState.member?.id ?? newState.id ?? oldState.member?.id ?? oldState.id;
    if (!stateGuildId || stateGuildId !== guildId || !userId) return;
    if (oldState.channelId && !newState.channelId) {
      await handleVoiceStateLeave(stateGuildId, userId, oldState.channelId);
    } else if (
      oldState.channelId &&
      newState.channelId &&
      oldState.channelId !== newState.channelId
    ) {
      await handleVoiceStateLeave(stateGuildId, userId, oldState.channelId);
      await handleVoiceStateJoin(newState);
    } else if (!oldState.channelId && newState.channelId) {
      await handleVoiceStateJoin(newState);
    }
  });
}
