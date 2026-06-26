import type { Message, MessageReaction, PartialMessageReaction, VoiceState } from "discord.js";
import { supabase } from "../supabase.js";
import { ensureChannel } from "./channels.js";
import { ensureGuild, getGuildTimezone } from "./helpers.js";
import { buildMessageRow, buildReactionRows } from "./messageRow.js";
import { upsertMember } from "./members.js";

function channelNameFromMessage(message: Message): string | undefined {
  const channel = message.channel;
  return "name" in channel && typeof channel.name === "string" ? channel.name : undefined;
}

export async function handleMessageCreate(message: Message): Promise<void> {
  const guildId = message.guildId;
  if (!guildId) return;

  await ensureGuild(guildId);
  await ensureChannel(guildId, message.channelId, channelNameFromMessage(message));
  await upsertMember(guildId, message.author.id, message.author.avatar);

  const timezone = await getGuildTimezone(guildId);
  const row = buildMessageRow(message, timezone);
  if (!row) return;

  const { data: inserted, error: insertError } = await supabase
    .from("messages")
    .insert(row)
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") return;
    console.error("stats: insert message:", insertError.message);
    return;
  }

  const reactionRows = buildReactionRows(message);
  if (inserted?.id && reactionRows.length > 0) {
    const withMessageId = reactionRows.map((r) => ({ ...r, message_id: inserted.id }));
    await supabase.from("message_reactions").insert(withMessageId);
  }

  await supabase.from("guild_channel_sync_state").upsert(
    {
      guild_id: guildId,
      channel_id: message.channelId,
      last_processed_message_id: message.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "guild_id,channel_id" }
  );
}

async function getOurMessageId(
  guildId: string,
  channelId: string,
  discordMessageId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("guild_id", guildId)
    .eq("channel_id", channelId)
    .eq("discord_message_id", discordMessageId)
    .is("deleted_at", null)
    .maybeSingle();
  return data?.id ?? null;
}

export async function handleMessageReactionAdd(
  reaction: MessageReaction | PartialMessageReaction
): Promise<void> {
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }
  const message = reaction.message;
  const guildId = message.guildId ?? (message as { guildId?: string }).guildId;
  if (!guildId || !message.channelId) return;

  const ourMessageId = await getOurMessageId(guildId, message.channelId, message.id);
  if (!ourMessageId) return;

  const emoji = reaction.emoji;
  const emojiId = emoji.id || null;
  const emojiName = emoji.name ?? emoji.identifier ?? "unknown";

  const { data: existing } = await supabase
    .from("message_reactions")
    .select("count")
    .eq("message_id", ourMessageId)
    .eq("emoji_id", emojiId)
    .eq("emoji_name", emojiName)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("message_reactions")
      .update({ count: (existing.count ?? 0) + 1 })
      .eq("message_id", ourMessageId)
      .eq("emoji_id", emojiId)
      .eq("emoji_name", emojiName);
  } else {
    await supabase.from("message_reactions").insert({
      message_id: ourMessageId,
      emoji_id: emojiId,
      emoji_name: emojiName,
      count: 1,
    });
  }
}

export async function handleMessageReactionRemove(
  reaction: MessageReaction | PartialMessageReaction
): Promise<void> {
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }
  const message = reaction.message;
  const guildId = message.guildId ?? (message as { guildId?: string }).guildId;
  if (!guildId || !message.channelId) return;

  const ourMessageId = await getOurMessageId(guildId, message.channelId, message.id);
  if (!ourMessageId) return;

  const emoji = reaction.emoji;
  const emojiId = emoji.id || null;
  const emojiName = emoji.name ?? emoji.identifier ?? "unknown";

  const { data: existing } = await supabase
    .from("message_reactions")
    .select("count")
    .eq("message_id", ourMessageId)
    .eq("emoji_id", emojiId)
    .eq("emoji_name", emojiName)
    .maybeSingle();

  if (!existing) return;
  const newCount = Math.max(0, (existing.count ?? 1) - 1);
  if (newCount === 0) {
    await supabase
      .from("message_reactions")
      .delete()
      .eq("message_id", ourMessageId)
      .eq("emoji_id", emojiId)
      .eq("emoji_name", emojiName);
  } else {
    await supabase
      .from("message_reactions")
      .update({ count: newCount })
      .eq("message_id", ourMessageId)
      .eq("emoji_id", emojiId)
      .eq("emoji_name", emojiName);
  }
}

export async function softDeleteMessage(
  guildId: string,
  channelId: string,
  discordMessageId: string
): Promise<void> {
  await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("guild_id", guildId)
    .eq("channel_id", channelId)
    .eq("discord_message_id", discordMessageId);
}

export async function handleVoiceStateJoin(state: VoiceState): Promise<void> {
  const guildId = state.guild?.id;
  const channelId = state.channelId;
  if (!guildId || !channelId || !state.member?.id) return;

  await ensureGuild(guildId);
  await ensureChannel(guildId, channelId, state.channel?.name);
  await upsertMember(guildId, state.member.id, state.member.user.avatar);

  await supabase.from("voice_sessions").insert({
    guild_id: guildId,
    channel_id: channelId,
    user_id: state.member.id,
    joined_at: new Date().toISOString(),
    left_at: null,
  });
}

export async function handleVoiceStateLeave(
  guildId: string,
  userId: string,
  channelIdLeft: string
): Promise<void> {
  const { data: open } = await supabase
    .from("voice_sessions")
    .select("id")
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .eq("channel_id", channelIdLeft)
    .is("left_at", null)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (open?.id) {
    await supabase
      .from("voice_sessions")
      .update({ left_at: new Date().toISOString() })
      .eq("id", open.id);
  }
}

export async function recordMemberCountSnapshot(
  guildId: string,
  memberCount: number
): Promise<void> {
  await ensureGuild(guildId);
  await supabase.from("member_count_snapshots").insert({
    guild_id: guildId,
    recorded_at: new Date().toISOString(),
    member_count: memberCount,
  });
}
