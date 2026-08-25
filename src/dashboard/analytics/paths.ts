export const ALLOWED_ANALYTICS_PATHS = [
  "/",
  "/timetable",
  "/my-timetable",
  "/settings",
  "/admin",
] as const;

export type AllowedAnalyticsPath = (typeof ALLOWED_ANALYTICS_PATHS)[number];

const ALLOWED = new Set<string>(ALLOWED_ANALYTICS_PATHS);
const DEDUP_WINDOW_MS = 30_000;

export function normalizeAnalyticsPath(raw: unknown): AllowedAnalyticsPath | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let pathname = trimmed;
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      pathname = new URL(trimmed).pathname;
    }
  } catch {
    return null;
  }
  const noQuery = pathname.split("?")[0]?.split("#")[0] ?? "";
  const collapsed = noQuery.replace(/\/{2,}/g, "/");
  const path = collapsed.length > 1 ? collapsed.replace(/\/$/, "") : collapsed || "/";
  if (!ALLOWED.has(path)) return null;
  return path as AllowedAnalyticsPath;
}

export function shouldRecordPageView(
  last: { path: string; occurredAt: Date } | null,
  nextPath: string,
  now: Date,
  windowMs = DEDUP_WINDOW_MS
): boolean {
  if (!last) return true;
  if (last.path !== nextPath) return true;
  return now.getTime() - last.occurredAt.getTime() >= windowMs;
}

export { DEDUP_WINDOW_MS };
