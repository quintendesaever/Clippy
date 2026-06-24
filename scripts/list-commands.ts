import "dotenv/config";
import { REST, Routes } from "discord.js";

const token = process.env.DISCORD_TOKEN?.trim();
const clientId = process.env.CLIENT_ID?.trim();
const guildId = process.env.GUILD_ID?.trim();

if (!token || !clientId || !guildId) {
  console.error("Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);
const global = (await rest.get(Routes.applicationCommands(clientId))) as { name: string }[];
const guild = (await rest.get(Routes.applicationGuildCommands(clientId, guildId))) as {
  name: string;
  options?: { name: string; type: number }[];
}[];

console.log("Global commands:", global.map((c) => c.name).join(", ") || "(none)");
for (const cmd of guild) {
  const subs = cmd.options?.filter((o) => o.type === 1).map((o) => o.name) ?? [];
  console.log(`Guild: /${cmd.name}${subs.length ? ` [${subs.join(", ")}]` : ""}`);
}
