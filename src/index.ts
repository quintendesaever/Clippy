import "dotenv/config";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { loadCommands } from "./commands/index.js";
import { getGuildId } from "./config.js";
import {
  handleMessageCreate,
  softDeleteMessage,
  handleMessageReactionAdd,
  handleMessageReactionRemove,
  handleVoiceStateJoin,
  handleVoiceStateLeave,
  recordMemberCountSnapshot,
} from "./stats/liveHandlers.js";
import { ensureGuild } from "./stats/helpers.js";
import { syncGuildMembers } from "./stats/members.js";
import { startF1ReminderJob } from "./f1/reminderJob.js";
import { startTimetablePanelJob } from "./calendar/timetablePanelJob.js";
import { handleTimetableButton } from "./calendar/timetableInteractions.js";
import { handleF1Button } from "./f1/interactions.js";
import { deleteMemberCalendar } from "./calendar/memberCalendars.js";

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
  console.error("Missing DISCORD_TOKEN in .env");
  process.exit(1);
}

let guildId: string;
try {
  guildId = getGuildId();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

const commands = await loadCommands();
console.log(`Loaded ${commands.size} slash command(s): ${[...commands.keys()].join(", ")}`);

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user?.tag}`);

  const otherGuilds = client.guilds.cache.filter((g) => g.id !== guildId);
  if (otherGuilds.size > 0) {
    console.warn(
      `Bot is in ${otherGuilds.size} other guild(s) besides GUILD_ID=${guildId}. ClippyV3 is single-server only.`
    );
  }

  const guild = client.guilds.cache.get(guildId);
  if (guild) {
    ensureGuild(guildId).catch((err) => console.error("stats: ensure guild:", err));
    syncGuildMembers(guild).catch((err) => console.error("stats: sync members:", err));
    recordMemberCountSnapshot(guildId, guild.memberCount).catch((err) =>
      console.error("stats: member count snapshot:", err)
    );
  } else {
    console.warn(`Bot is not in configured GUILD_ID=${guildId}`);
  }

  startF1ReminderJob(client);
  startTimetablePanelJob(client);

  if (process.env.CLIENT_SECRET?.trim() && process.env.SESSION_SECRET?.trim()) {
    const { startDashboardServer } = await import("./dashboard/server.js");
    startDashboardServer(client);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    try {
      const handledTimetable = await handleTimetableButton(interaction);
      if (handledTimetable) return;
      const handledF1 = await handleF1Button(interaction);
      if (handledF1) return;
    } catch (err) {
      console.error("Error handling button:", err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    console.warn(`No handler for slash command: ${interaction.commandName}`);
    const payload = {
      content: "This command is not available on the running bot version. Ask an admin to redeploy.",
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error executing ${interaction.commandName}:`, err);
    const payload = { content: "Something went wrong.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.on("guildMemberRemove", async (member) => {
  if (member.guild.id !== guildId) return;
  try {
    await deleteMemberCalendar(guildId, member.id);
  } catch (err) {
    console.error("guildMemberRemove calendar cleanup:", err);
  }
});

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

client.login(token).catch((err) => {
  console.error("Failed to login:", err);
  process.exit(1);
});
