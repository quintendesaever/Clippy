export function getGuildId(): string {
  const id = process.env.GUILD_ID?.trim();
  if (!id) {
    throw new Error("GUILD_ID is required in environment");
  }
  return id;
}

export function getDashboardUrl(): string {
  const port = Number(process.env.DASHBOARD_PORT) || 3000;
  return (process.env.DASHBOARD_URL || `http://localhost:${port}`).replace(/\/$/, "");
}
