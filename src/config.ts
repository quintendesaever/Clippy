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

/** Discord link buttons reject localhost URLs. */
export function getPublicDashboardUrl(): string | null {
  try {
    const parsed = new URL(getDashboardUrl());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}
