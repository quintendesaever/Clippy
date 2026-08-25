import crypto from "node:crypto";
import type { Request, Response } from "express";

export const ANALYTICS_SESSION_COOKIE = "clippy_vid";
export const ANALYTICS_SESSION_MAX_AGE_MS = 30 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    if (key !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(eq + 1));
    } catch {
      return trimmed.slice(eq + 1);
    }
  }
  return undefined;
}

export function resolveAnalyticsSessionId(cookieHeader: string | undefined): {
  sessionId: string;
  isNew: boolean;
} {
  const existing = readCookie(cookieHeader, ANALYTICS_SESSION_COOKIE);
  if (existing && isUuid(existing)) {
    return { sessionId: existing, isNew: false };
  }
  return { sessionId: crypto.randomUUID(), isNew: true };
}

export function setAnalyticsSessionCookie(
  res: Response,
  sessionId: string,
  options: { secure: boolean }
): void {
  res.cookie(ANALYTICS_SESSION_COOKIE, sessionId, {
    maxAge: ANALYTICS_SESSION_MAX_AGE_MS,
    httpOnly: true,
    sameSite: "lax",
    secure: options.secure,
    path: "/",
  });
}

export function getOrCreateAnalyticsSession(
  req: Request,
  res: Response,
  options: { secure: boolean }
): string {
  const { sessionId } = resolveAnalyticsSessionId(req.headers.cookie);
  setAnalyticsSessionCookie(res, sessionId, options);
  return sessionId;
}
