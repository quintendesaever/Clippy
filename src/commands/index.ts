import { readdirSync } from "fs";
import { pathToFileURL } from "url";
import path from "path";
import { fileURLToPath } from "url";
import { Collection } from "discord.js";
import type { Command } from "../types/command.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let commandsCache: Collection<string, Command> | null = null;

function collectCommandFiles(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectCommandFiles(fullPath, files);
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".js")) &&
      !entry.name.startsWith("index")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function loadCommands(): Promise<Collection<string, Command>> {
  if (commandsCache) return commandsCache;

  const commands = new Collection<string, Command>();
  const commandFiles = collectCommandFiles(__dirname);

  for (const filePath of commandFiles) {
    try {
      const url = pathToFileURL(filePath).href;
      const module = await import(url);
      const command = module.default ?? module.command;
      if (!command?.data || typeof command.execute !== "function") continue;
      const name = command.data.name;
      if (commands.has(name)) {
        console.warn(`Duplicate command name "${name}" from ${filePath}, skipping.`);
        continue;
      }
      commands.set(name, command as Command);
    } catch (err) {
      console.warn(`Failed to load command from ${filePath}:`, err);
    }
  }

  commandsCache = commands;
  return commands;
}
