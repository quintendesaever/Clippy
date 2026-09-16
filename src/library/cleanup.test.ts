import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRolloverCleanupMarker,
  cleanupLibraryChannel,
  selectLibraryCleanupDeletes,
  type CleanupDiscord,
  type CleanupMessageLike,
} from "./cleanup.js";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const now = Date.parse("2026-09-16T12:00:00.000Z");

function message(partial: Partial<CleanupMessageLike> & { id: string }): CleanupMessageLike {
  return {
    pinned: false,
    createdTimestamp: now - 60_000,
    ...partial,
  };
}

describe("selectLibraryCleanupDeletes", () => {
  it("preserves the stored schedule id even if it is unpinned", () => {
    const result = selectLibraryCleanupDeletes({
      now,
      scheduleMessageId: "schedule",
      messages: [
        message({ id: "schedule", pinned: false }),
        message({ id: "chat" }),
      ],
    });
    assert.deepEqual(result.deleteIds, ["chat"]);
    assert.equal(result.preserved, 1);
  });

  it("preserves every pinned message including timetable panels", () => {
    const result = selectLibraryCleanupDeletes({
      now,
      scheduleMessageId: "schedule",
      messages: [
        message({ id: "schedule", pinned: true }),
        message({ id: "timetable", pinned: true }),
        message({ id: "pin-2", pinned: true }),
        message({ id: "chat" }),
      ],
    });
    assert.deepEqual(result.deleteIds, ["chat"]);
    assert.equal(result.preserved, 3);
  });

  it("leaves messages older than 14 days and counts them", () => {
    const result = selectLibraryCleanupDeletes({
      now,
      scheduleMessageId: "schedule",
      messages: [
        message({ id: "old", createdTimestamp: now - TWO_WEEKS_MS - 1 }),
        message({ id: "young" }),
      ],
    });
    assert.deepEqual(result.deleteIds, ["young"]);
    assert.equal(result.skippedOld, 1);
  });
});

describe("cleanupLibraryChannel", () => {
  it("skips cleanup when ManageMessages is missing", async () => {
    const discord: CleanupDiscord = {
      hasManageMessages: () => false,
      async fetchBatch() {
        throw new Error("should not fetch");
      },
      async bulkDelete() {
        throw new Error("should not delete");
      },
    };
    const result = await cleanupLibraryChannel({
      discord,
      scheduleMessageId: "schedule",
      now,
    });
    assert.deepEqual(result, { deleted: 0, skippedOld: 0, skipped: true });
  });

  it("bulk-deletes young discussion across batches and keeps pins", async () => {
    const deleted: string[] = [];
    const batches: CleanupMessageLike[][] = [
      [
        message({ id: "schedule", pinned: true }),
        message({ id: "chat-1" }),
        ...Array.from({ length: 98 }, (_, i) => message({ id: `fill-${i}` })),
      ],
      [message({ id: "chat-2" }), message({ id: "timetable", pinned: true })],
    ];
    const discord: CleanupDiscord = {
      hasManageMessages: () => true,
      async fetchBatch() {
        return batches.shift() ?? [];
      },
      async bulkDelete(ids) {
        deleted.push(...ids);
        return ids.length;
      },
    };
    const result = await cleanupLibraryChannel({
      discord,
      scheduleMessageId: "schedule",
      now,
    });
    assert.equal(result.skipped, false);
    assert.ok(deleted.includes("chat-1"));
    assert.ok(deleted.includes("chat-2"));
    assert.ok(!deleted.includes("schedule"));
    assert.ok(!deleted.includes("timetable"));
  });
});

describe("applyRolloverCleanupMarker", () => {
  it("does not advance the marker when cleanup throws", async () => {
    await assert.rejects(
      () =>
        applyRolloverCleanupMarker({
          lastCleanupDayKey: "2026-09-15",
          dayKey: "2026-09-16",
          async runCleanup() {
            throw new Error("bulk delete failed");
          },
        }),
      /bulk delete failed/
    );
  });

  it("advances after a successful cleanup", async () => {
    const result = await applyRolloverCleanupMarker({
      lastCleanupDayKey: "2026-09-15",
      dayKey: "2026-09-16",
      async runCleanup() {
        return "ok";
      },
    });
    assert.deepEqual(result, { persistDayKey: true, ran: true });
  });

  it("advances after an intentional permission skip", async () => {
    const result = await applyRolloverCleanupMarker({
      lastCleanupDayKey: "2026-09-15",
      dayKey: "2026-09-16",
      async runCleanup() {
        return "skipped";
      },
    });
    assert.deepEqual(result, { persistDayKey: true, ran: true });
  });

  it("sets the marker on first run without cleaning", async () => {
    let ran = false;
    const result = await applyRolloverCleanupMarker({
      lastCleanupDayKey: null,
      dayKey: "2026-09-16",
      async runCleanup() {
        ran = true;
        return "ok";
      },
    });
    assert.equal(ran, false);
    assert.deepEqual(result, { persistDayKey: true, ran: false });
  });
});
