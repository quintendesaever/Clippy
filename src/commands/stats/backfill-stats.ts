import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type TextChannel,
  type Message,
} from "discord.js";
import type { Command } from "../../types/command.js";
import { supabase } from "../../supabase.js";
import { ensureGuildAndGetTimezone } from "../../stats/helpers.js";
import { buildMessageRow, buildReactionRows, type MessageRowInsert, type ReactionRowInsert } from "../../stats/messageRow.js";

const FETCH_LIMIT = 100;
const INSERT_CHUNK = 80;
const DELAY_MS = 600;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const backfillStats: Command = {
  data: new SlashCommandBuilder()
    .setName("backfill-stats")
    .setDescription("Backfill message history for this server's stats (Manage Guild only).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const guildId = guild.id;

    const timezone = await ensureGuildAndGetTimezone(guildId);

    const channels = guild.channels.cache.filter(
      (c): c is TextChannel =>
        c.type === ChannelType.GuildText &&
        "viewable" in c &&
        (c as { viewable?: boolean }).viewable !== false
    );

    let totalProcessed = 0;
    const errors: string[] = [];

    for (const channel of channels.values()) {
      try {
        const { data: syncRow } = await supabase
          .from("guild_channel_sync_state")
          .select("last_processed_message_id")
          .eq("guild_id", guildId)
          .eq("channel_id", channel.id)
          .maybeSingle();

        const lastProcessedId = syncRow?.last_processed_message_id ?? undefined;
        const isIncremental = !!lastProcessedId;
        let channelProcessed = 0;
        let cursorId: string | undefined = lastProcessedId;
        let channelNewestId: string | undefined = lastProcessedId ?? undefined;

        while (true) {
          const options: { limit: number; before?: string; after?: string } = { limit: FETCH_LIMIT };
          if (isIncremental) {
            options.after = cursorId;
          } else if (cursorId) {
            options.before = cursorId;
          }

          const messages = await channel.messages.fetch(options);
          if (messages.size === 0) break;

          const messageArray = Array.from(messages.values());
          if (!channelNewestId) channelNewestId = messageArray[0]?.id;
          const batchNewestId = messageArray.reduce(
            (max, m) => (m.id > max ? m.id : max),
            messageArray[0]?.id ?? ""
          );
          if (batchNewestId && (!channelNewestId || batchNewestId > channelNewestId))
            channelNewestId = batchNewestId;

          const rows: MessageRowInsert[] = [];
          const reactionRowsByDiscordId = new Map<string, Omit<ReactionRowInsert, "message_id">[]>();

          for (const msg of messageArray) {
            if (msg.author.bot) continue;
            const row = buildMessageRow(msg as Message, timezone);
            if (row) {
              rows.push(row);
              const reactions = buildReactionRows(msg as Message);
              if (reactions.length > 0) reactionRowsByDiscordId.set(msg.id, reactions);
            }
          }

          if (rows.length > 0) {
            for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
              const chunk = rows.slice(i, i + INSERT_CHUNK);
              const { data: inserted, error: insertError } = await supabase
                .from("messages")
                .insert(chunk)
                .select("id, discord_message_id");

              if (insertError) {
                errors.push(`${channel.name}: ${insertError.message}`);
                break;
              }

              if (inserted?.length) {
                const reactionInserts: ReactionRowInsert[] = [];
                for (const row of inserted) {
                  const reactions = reactionRowsByDiscordId.get(row.discord_message_id);
                  if (reactions)
                    for (const r of reactions)
                      reactionInserts.push({ ...r, message_id: row.id });
                }
                if (reactionInserts.length > 0)
                  await supabase.from("message_reactions").insert(reactionInserts);
              }
            }

            channelProcessed += rows.length;
            totalProcessed += rows.length;
          }

          await supabase.from("guild_channel_sync_state").upsert(
            {
              guild_id: guildId,
              channel_id: channel.id,
              last_processed_message_id: channelNewestId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "guild_id,channel_id" }
          );

          if (messages.size < FETCH_LIMIT) break;
          cursorId = isIncremental ? batchNewestId : messageArray[messageArray.length - 1]?.id;
          if (!cursorId) break;
          await delay(DELAY_MS);
        }

        if (channelProcessed > 0) {
          await interaction.editReply(
            `Backfilling… Processed **${totalProcessed}** messages so far (last: #${channel.name}).`
          ).catch(() => {});
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${channel.name}: ${msg}`);
      }
    }

    let reply = `Backfill finished. Processed **${totalProcessed}** messages across **${channels.size}** channels.`;
    if (errors.length > 0) reply += `\n\nSome errors:\n${errors.slice(0, 5).join("\n")}`;
    await interaction.editReply(reply).catch(() => {});
  },
};

export default backfillStats;
