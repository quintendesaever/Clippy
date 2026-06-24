import type { Message } from "discord.js";
import { toLocalHourAndDay } from "./helpers.js";

export interface ReactionRowInsert {
  message_id: string;
  emoji_id: string | null;
  emoji_name: string;
  count: number;
}

export interface MessageRowInsert {
  guild_id: string;
  channel_id: string;
  user_id: string;
  discord_message_id: string;
  created_at: string;
  hour_local: number;
  day_local: string;
  attachment_count: number;
  word_count: number;
  char_count: number;
  reply_to_message_id: string | null;
  thread_id: string | null;
}

export function buildMessageRow(message: Message, timezone: string): MessageRowInsert | null {
  const guildId = message.guildId;
  if (!guildId) return null;

  const createdAt = new Date(message.createdTimestamp);
  const { hourLocal, dayLocal } = toLocalHourAndDay(createdAt, timezone);

  const content = message.content ?? "";
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return {
    guild_id: guildId,
    channel_id: message.channelId,
    user_id: message.author.id,
    discord_message_id: message.id,
    created_at: createdAt.toISOString(),
    hour_local: hourLocal,
    day_local: dayLocal,
    attachment_count: message.attachments.size,
    word_count: wordCount,
    char_count: content.length,
    reply_to_message_id: message.reference?.messageId ?? null,
    thread_id: message.thread?.id ?? null,
  };
}

export function buildMessageRowFromFields(
  guildId: string,
  channelId: string,
  userId: string,
  discordMessageId: string,
  createdTimestamp: number,
  timezone: string,
  options: {
    attachmentCount?: number;
    wordCount?: number;
    charCount?: number;
    replyToMessageId?: string | null;
    threadId?: string | null;
  } = {}
): MessageRowInsert {
  const createdAt = new Date(createdTimestamp);
  const { hourLocal, dayLocal } = toLocalHourAndDay(createdAt, timezone);
  return {
    guild_id: guildId,
    channel_id: channelId,
    user_id: userId,
    discord_message_id: discordMessageId,
    created_at: createdAt.toISOString(),
    hour_local: hourLocal,
    day_local: dayLocal,
    attachment_count: options.attachmentCount ?? 0,
    word_count: options.wordCount ?? 0,
    char_count: options.charCount ?? 0,
    reply_to_message_id: options.replyToMessageId ?? null,
    thread_id: options.threadId ?? null,
  };
}

export function buildReactionRows(
  message: Message
): Omit<ReactionRowInsert, "message_id">[] {
  const rows: Omit<ReactionRowInsert, "message_id">[] = [];
  for (const reaction of message.reactions.cache.values()) {
    const emoji = reaction.emoji;
    rows.push({
      emoji_id: emoji.id || null,
      emoji_name: emoji.name ?? (emoji.identifier || "unknown"),
      count: reaction.count,
    });
  }
  return rows;
}
