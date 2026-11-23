import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import type { Server } from "node:http";

process.env.SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
process.env.CLIENT_ID = "test-client";
process.env.CLIENT_SECRET = "test-secret";
process.env.SESSION_SECRET = "test-session-secret-32-chars-min";
process.env.DASHBOARD_URL = "http://localhost:3000";

const { createDashboardApp } = await import("./server.js");

const SESSION_ROUTES: Array<[method: string, path: string]> = [
  ["GET", "/api/me"],
  ["PATCH", "/api/preferences"],
  ["GET", "/api/calendar"],
  ["PUT", "/api/calendar"],
  ["DELETE", "/api/calendar"],
  ["GET", "/api/calendars"],
  ["GET", "/api/timetable"],
  ["POST", "/api/activities"],
  ["PATCH", "/api/activities/abc"],
  ["DELETE", "/api/activities/abc"],
  ["POST", "/api/activities/abc/join"],
  ["DELETE", "/api/activities/abc/join"],
  ["GET", "/api/admin/status"],
  ["GET", "/api/admin/stats"],
  ["GET", "/api/admin/users"],
  ["GET", "/api/admin/discord/stats"],
  ["GET", "/api/admin/permissions"],
  ["GET", "/api/admin/bot-settings"],
  ["PATCH", "/api/admin/bot-settings"],
];

describe("dashboard app", () => {
  let server: Server;
  let base = "";

  before(async () => {
    server = createDashboardApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    server.close();
    await once(server, "close");
  });

  it("health returns ok", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it("session routes reject unauthenticated", async () => {
    for (const [method, path] of SESSION_ROUTES) {
      const res = await fetch(`${base}${path}`, { method });
      assert.equal(res.status, 401, `${method} ${path}`);
      assert.deepEqual(await res.json(), { error: "Not authenticated" }, `${method} ${path}`);
    }
  });

  it("oauth start redirects to discord", async () => {
    const res = await fetch(`${base}/api/auth/discord`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.ok(res.headers.get("location")?.startsWith("https://discord.com/"));
  });

  it("csp header unchanged", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(
      res.headers.get("content-security-policy"),
      "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'none';img-src 'self' https://cdn.discordapp.com data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' 'unsafe-inline';connect-src 'self'"
    );
  });
});
