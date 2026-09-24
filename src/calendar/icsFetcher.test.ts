import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  configureIcsFetcherForTests,
  fetchIcsContent,
  resetIcsFetcherForTests,
} from "./icsFetcher.js";

const ICS_BODY = "BEGIN:VCALENDAR\nEND:VCALENDAR";
const HOST = "calendars.test";

function icsUrl(path: string): string {
  return `https://${HOST}${path}`;
}

function okResponse(body = ICS_BODY): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/calendar" },
  });
}

afterEach(() => {
  resetIcsFetcherForTests();
});

describe("fetchIcsContent", () => {
  it("serves fresh cache without refetching", async () => {
    let fetches = 0;
    configureIcsFetcherForTests({
      lookup: (async () => [{ address: "8.8.8.8", family: 4 }]) as typeof import("node:dns/promises").lookup,
      fetch: (async () => {
        fetches += 1;
        return okResponse();
      }) as typeof fetch,
      now: () => 1_000,
    });

    const url = icsUrl("/a.ics");
    assert.equal(await fetchIcsContent(url), ICS_BODY);
    assert.equal(await fetchIcsContent(url), ICS_BODY);
    assert.equal(fetches, 1);
  });

  it("retries once after a timeout then succeeds", async () => {
    let attempts = 0;
    const sleeps: number[] = [];
    configureIcsFetcherForTests({
      lookup: (async () => [{ address: "8.8.8.8", family: 4 }]) as typeof import("node:dns/promises").lookup,
      timeoutMs: 30,
      retryDelayMs: 5,
      maxAttempts: 2,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetch: (async (_url, init) => {
        attempts += 1;
        if (attempts === 1) {
          await new Promise<never>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          });
        }
        return okResponse("BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR");
      }) as typeof fetch,
    });

    const body = await fetchIcsContent(icsUrl("/retry.ics"));
    assert.match(body, /VERSION:2.0/);
    assert.equal(attempts, 2);
    assert.deepEqual(sleeps, [5]);
  });

  it("returns stale cache when a refresh times out", async () => {
    let now = 1_000;
    let phase: "ok" | "timeout" = "ok";
    configureIcsFetcherForTests({
      lookup: (async () => [{ address: "8.8.8.8", family: 4 }]) as typeof import("node:dns/promises").lookup,
      now: () => now,
      timeoutMs: 20,
      maxAttempts: 1,
      fetch: (async (_url, init) => {
        if (phase === "ok") return okResponse("STALE_BODY");
        await new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
        return okResponse();
      }) as typeof fetch,
    });

    const url = icsUrl("/stale.ics");
    assert.equal(await fetchIcsContent(url), "STALE_BODY");

    now = 1_000 + 21 * 60 * 1000; // past fresh TTL
    phase = "timeout";
    assert.equal(await fetchIcsContent(url), "STALE_BODY");
  });

  it("limits concurrent fetches per host", async () => {
    let active = 0;
    let peak = 0;

    configureIcsFetcherForTests({
      lookup: (async () => [{ address: "8.8.8.8", family: 4 }]) as typeof import("node:dns/promises").lookup,
      maxConcurrentPerHost: 2,
      maxAttempts: 1,
      timeoutMs: 2_000,
      fetch: (async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 40));
        active -= 1;
        return okResponse();
      }) as typeof fetch,
    });

    await Promise.all([
      fetchIcsContent(icsUrl("/1.ics")),
      fetchIcsContent(icsUrl("/2.ics")),
      fetchIcsContent(icsUrl("/3.ics")),
      fetchIcsContent(icsUrl("/4.ics")),
      fetchIcsContent(icsUrl("/5.ics")),
    ]);

    assert.equal(peak, 2);
  });

  it("does not retry non-timeout HTTP failures", async () => {
    let attempts = 0;
    configureIcsFetcherForTests({
      lookup: (async () => [{ address: "8.8.8.8", family: 4 }]) as typeof import("node:dns/promises").lookup,
      maxAttempts: 3,
      fetch: (async () => {
        attempts += 1;
        return new Response("nope", { status: 503 });
      }) as typeof fetch,
    });

    await assert.rejects(() => fetchIcsContent(icsUrl("/fail.ics")), /ICS fetch failed \(503\)/);
    assert.equal(attempts, 1);
  });
});
