import {
  DiscordAPIError,
  REST,
  RESTJSONErrorCodes,
  Routes,
  type Client,
  type TextChannel,
} from "discord.js";
import type { F1MessagePayload } from "./embeds.js";
import type { F1DiscordPort } from "./messageLifecycle.js";

function isMissingDiscordResource(err: unknown): boolean {
  return (
    err instanceof DiscordAPIError &&
    (err.code === RESTJSONErrorCodes.UnknownMessage ||
      err.code === RESTJSONErrorCodes.UnknownChannel)
  );
}

function payloadBody(payload: F1MessagePayload) {
  return {
    content: payload.content || undefined,
    embeds: payload.embeds.map((embed) => embed.toJSON()),
    components: payload.components.map((row) => row.toJSON()),
  };
}

export function createDiscordPort(client: Client): F1DiscordPort {
  return {
    async fetchChannel(channelId) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) return null;
      return { id: channel.id };
    },
    async deleteMessage(channelId, messageId) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased() || channel.isDMBased()) return "missing";
        const message = await (channel as TextChannel).messages.fetch(messageId);
        await message.delete();
        return "deleted";
      } catch (err) {
        if (isMissingDiscordResource(err)) return "missing";
        console.warn("f1 reminder: delete message failed", err);
        return "failed";
      }
    },
    async sendMessage(channelId, payload: F1MessagePayload) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased() || channel.isDMBased()) return null;
        const message = await (channel as TextChannel).send({
          content: payload.content || undefined,
          embeds: payload.embeds,
          components: payload.components,
        });
        return { messageId: message.id };
      } catch (err) {
        console.error("f1 reminder: send message failed", err);
        return null;
      }
    },
  };
}

export function createRestDiscordPort(rest: REST): F1DiscordPort {
  return {
    async fetchChannel(channelId) {
      try {
        await rest.get(Routes.channel(channelId));
        return { id: channelId };
      } catch (err) {
        if (isMissingDiscordResource(err)) return null;
        console.warn("f1 reminder: fetch channel failed", err);
        return null;
      }
    },
    async deleteMessage(channelId, messageId) {
      try {
        await rest.delete(Routes.channelMessage(channelId, messageId));
        return "deleted";
      } catch (err) {
        if (isMissingDiscordResource(err)) return "missing";
        console.warn("f1 reminder: delete message failed", err);
        return "failed";
      }
    },
    async sendMessage(channelId, payload) {
      try {
        const message = (await rest.post(Routes.channelMessages(channelId), {
          body: payloadBody(payload),
        })) as { id: string };
        return { messageId: message.id };
      } catch (err) {
        console.error("f1 reminder: send message failed", err);
        return null;
      }
    },
  };
}
