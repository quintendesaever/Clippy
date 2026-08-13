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

const DEFAULT_PUBLIC_DASHBOARD_ORIGIN = "https://dashboard.clippybot.be";

/** Discord link buttons reject localhost URLs; fall back to the public origin. */
export function getPublicDashboardUrl(): string {
  const explicit = process.env.PUBLIC_DASHBOARD_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      // fall through
    }
  }

  try {
    const parsed = new URL(getDashboardUrl());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return DEFAULT_PUBLIC_DASHBOARD_ORIGIN;
    }
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return DEFAULT_PUBLIC_DASHBOARD_ORIGIN;
    }
    return parsed.origin;
  } catch {
    return DEFAULT_PUBLIC_DASHBOARD_ORIGIN;
  }
}
