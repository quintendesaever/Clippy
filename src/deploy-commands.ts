import "dotenv/config";
import { REST, Routes } from "discord.js";
import { loadCommands } from "./commands/index.js";
import { getGuildId } from "./config.js";

const token = process.env.DISCORD_TOKEN?.trim();
const clientId = process.env.CLIENT_ID?.trim();

if (!token) {
  console.error("Missing DISCORD_TOKEN in .env");
  process.exit(1);
}
if (!clientId) {
  console.error("Missing CLIENT_ID in .env");
  process.exit(1);
}

let guildId: string;
try {
  guildId = getGuildId();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

try {
  const commands = await loadCommands();
  const body = [...commands.values()].map((cmd) => cmd.data.toJSON());

  // Remove stale global commands from older deployments (e.g. bare /timetable, /calendar, /f1).
  await rest.put(Routes.applicationCommands(clientId), { body: [] });
  console.log("Cleared global slash commands.");

  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
  console.log(`Successfully registered ${body.length} slash command(s) for guild ${guildId}.`);
} catch (error) {
  console.error("Failed to register commands:", error);
  process.exit(1);
}
