import type { Request, Response } from "express";
import { supabase } from "../../supabase.js";
import { getDashboardUrl, getGuildId } from "../../config.js";
import { geoFromRequestHeaders, sanitizeReferrer } from "./geo.js";
import { normalizeAnalyticsPath, shouldRecordPageView } from "./paths.js";
import { getOrCreateAnalyticsSession } from "./session.js";
import { parseUserAgent } from "./ua.js";

export type RecordPageViewResult =
  | { ok: true; recorded: boolean; reason?: "duplicate" }
  | { ok: false; error: string; status: number };

type SessionUser = { id: string } | undefined;

export async function recordDashboardPageView(
  req: Request,
  res: Response,
  options: { user?: SessionUser; secure: boolean }
): Promise<RecordPageViewResult> {
  const path = normalizeAnalyticsPath((req.body as { path?: unknown } | undefined)?.path);
  if (!path) {
    return { ok: false, error: "path is not an allowed dashboard route", status: 400 };
  }

  const guildId = getGuildId();
  const sessionId = getOrCreateAnalyticsSession(req, res, { secure: options.secure });
  const userId = options.user?.id ?? null;
  const now = new Date();

  const { data: lastRow, error: lastError } = await supabase
    .from("dashboard_page_views")
    .select("path, occurred_at")
    .eq("guild_id", guildId)
    .eq("session_id", sessionId)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) {
    console.error("analytics: load last page view:", lastError.message);
    return { ok: false, error: "Failed to record page view", status: 500 };
  }

  const last = lastRow
    ? { path: String(lastRow.path), occurredAt: new Date(lastRow.occurred_at as string) }
    : null;
  if (!shouldRecordPageView(last, path, now)) {
    return { ok: true, recorded: false, reason: "duplicate" };
  }

  const geo = geoFromRequestHeaders(req.headers);
  const ua = parseUserAgent(req.get("user-agent"));
  const referrer = sanitizeReferrer(req.get("referer") ?? req.get("referrer"), getDashboardUrl());

  const { error: insertError } = await supabase.from("dashboard_page_views").insert({
    guild_id: guildId,
    user_id: userId,
    session_id: sessionId,
    occurred_at: now.toISOString(),
    path,
    country: geo.country,
    region: geo.region,
    city: geo.city,
    device_type: ua.deviceType,
    browser_family: ua.browserFamily,
    referrer,
  });

  if (insertError) {
    console.error("analytics: insert page view:", insertError.message);
    return { ok: false, error: "Failed to record page view", status: 500 };
  }

  if (userId) {
    const memberUpdate: {
      last_dashboard_at: string;
      updated_at: string;
      last_country?: string;
      last_region?: string;
      last_city?: string;
    } = {
      last_dashboard_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    if (geo.country) memberUpdate.last_country = geo.country;
    if (geo.region) memberUpdate.last_region = geo.region;
    if (geo.city) memberUpdate.last_city = geo.city;
    const { error: memberError } = await supabase
      .from("members")
      .update(memberUpdate)
      .eq("guild_id", guildId)
      .eq("user_id", userId);
    if (memberError) {
      console.error("analytics: update member last seen:", memberError.message);
    }
  }

  return { ok: true, recorded: true };
}
