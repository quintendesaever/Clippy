import "dotenv/config";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { logMemberLeave } from "./audit/events.js";
import { registerAuditEvents } from "./audit/discordEvents.js";
import { loadCommands } from "./commands/index.js";
import { getGuildId } from "./config.js";
import { recordMemberCountSnapshot } from "./stats/liveHandlers.js";
import { registerStatsEvents } from "./stats/discordEvents.js";
import { ensureGuild } from "./stats/helpers.js";
import { syncGuildMembers, markMemberLeft } from "./stats/members.js";
import { startF1ReminderJob } from "./f1/job.js";
import { startTimetablePanelJob } from "./calendar/job.js";
import { startLibraryJob } from "./library/job.js";
import { registerInteractionHandler } from "./interactions.js";
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
    syncGuildMembers(guild)
      .then((result) => {
        if (result.error) {
          console.error("stats: sync members:", result.error);
          return;
        }
        return recordMemberCountSnapshot(guildId, result.humanCount);
      })
      .catch((err) => console.error("stats: sync members / snapshot:", err));
  } else {
    console.warn(`Bot is not in configured GUILD_ID=${guildId}`);
  }

  startF1ReminderJob(client);
  startTimetablePanelJob(client);
  startLibraryJob(client);
});

registerInteractionHandler(client, commands);

registerAuditEvents(client, guildId);

client.on("guildMemberRemove", async (member) => {
  if (member.guild.id !== guildId) return;
  try {
    await markMemberLeft(guildId, member.id);
    await deleteMemberCalendar(guildId, member.id);
  } catch (err) {
    console.error("guildMemberRemove cleanup:", err);
  }
  void logMemberLeave(client, member);
});

registerStatsEvents(client, guildId);

// HTTP dashboard must come up even if Discord auth fails so container
// /api/health (CD staging) stays green. Production deploy still gates on
// /api/status?ready=1 which requires a ready Discord client.
if (process.env.CLIENT_SECRET?.trim() && process.env.SESSION_SECRET?.trim()) {
  const { startDashboardServer } = await import("./dashboard/server.js");
  startDashboardServer(client);
} else {
  console.warn("Dashboard not started: CLIENT_SECRET or SESSION_SECRET missing");
}

client.login(token).catch((err) => {
  console.error("Failed to login:", err);
  console.error(
    "Discord unavailable; keeping process up for /api/health. Production ready checks will fail until Discord works."
  );
});
