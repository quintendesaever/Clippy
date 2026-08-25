import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAdminRangePreset, resolveRangeBounds } from "./adminStatsAggregate.js";
import {
  aggregateDiscordStats,
  DISCORD_RECENT_LIMIT,
  MAX_RELIABLE_VOICE_SECONDS,
  type DiscordMessageRow,
  type DiscordVoiceRow,
} from "./discordStatsAggregate.js";

const TZ = "Europe/Brussels";
const NOW = new Date("2026-08-25T12:00:00.000Z");

function message(overrides: Partial<DiscordMessageRow>): DiscordMessageRow {
  return {
    user_id: "u1",
    channel_id: "c-text",
    created_at: "2026-08-25T10:00:00.000Z",
    attachment_count: 0,
    word_count: 3,
    ...overrides,
  };
}

function voice(overrides: Partial<DiscordVoiceRow>): DiscordVoiceRow {
  return {
    user_id: "u1",
    channel_id: "c-voice",
    joined_at: "2026-08-25T09:00:00.000Z",
    left_at: "2026-08-25T09:10:00.000Z",
    ...overrides,
  };
}

function aggregate(
  preset: "today" | "7d" | "30d" | "all",
  rows: { messages?: DiscordMessageRow[]; voice?: DiscordVoiceRow[] },
  totals?: { messagesTotal?: number; voiceSessionsTotal?: number }
) {
  const bounds = resolveRangeBounds(preset, TZ, NOW);
  return aggregateDiscordStats({
    messages: rows.messages ?? [],
    voiceSessions: rows.voice ?? [],
    messagesTotal: totals?.messagesTotal ?? (rows.messages ?? []).length,
    voiceSessionsTotal: totals?.voiceSessionsTotal ?? (rows.voice ?? []).length,
    timezone: TZ,
    preset,
    from: bounds.from,
    to: bounds.to,
    fromDayKey: bounds.fromDayKey,
    toDayKey: bounds.toDayKey,
    memberCount: 32,
    memberCountRecordedAt: "2026-08-25T08:00:00.000Z",
  });
}

describe("parseAdminRangePreset", () => {
  it("accepts known presets and falls back to 7d for invalid values", () => {
    assert.equal(parseAdminRangePreset("today"), "today");
    assert.equal(parseAdminRangePreset("7d"), "7d");
    assert.equal(parseAdminRangePreset("30d"), "30d");
    assert.equal(parseAdminRangePreset("all"), "all");
    assert.equal(parseAdminRangePreset("nope"), "7d");
    assert.equal(parseAdminRangePreset(""), "7d");
    assert.equal(parseAdminRangePreset(undefined), "7d");
    assert.equal(parseAdminRangePreset(12), "7d");
  });
});

describe("aggregateDiscordStats", () => {
  it("filters messages to the selected guild-timezone range", () => {
    const stats = aggregate("today", {
      messages: [
        message({ created_at: "2026-08-24T21:59:00.000Z", user_id: "old" }),
        message({ created_at: "2026-08-24T22:00:00.000Z", user_id: "u1" }),
        message({ created_at: "2026-08-25T11:00:00.000Z", user_id: "u2" }),
        message({ created_at: "2026-08-25T13:00:00.000Z", user_id: "future" }),
      ],
    });
    assert.equal(stats.summary.messagesInRange, 2);
    assert.equal(stats.summary.uniqueAuthors, 2);
    assert.equal(stats.users.length, 2);
  });

  it("counts messages, attachments, and per-user totals", () => {
    const stats = aggregate("7d", {
      messages: [
        message({ user_id: "u1", channel_id: "general", attachment_count: 2 }),
        message({ user_id: "u1", channel_id: "general", created_at: "2026-08-25T10:01:00.000Z" }),
        message({ user_id: "u2", channel_id: "random", created_at: "2026-08-25T11:00:00.000Z" }),
      ],
    });
    assert.equal(stats.summary.messagesInRange, 3);
    assert.equal(stats.summary.attachmentsInRange, 2);
    assert.equal(stats.topUsersByMessages[0]?.key, "u1");
    assert.equal(stats.topUsersByMessages[0]?.count, 2);
    assert.equal(stats.topChannelsByMessages[0]?.key, "general");
    assert.equal(stats.topChannelsByMessages[0]?.count, 2);
    const u1 = stats.users.find((row) => row.userId === "u1");
    assert.equal(u1?.messageCount, 2);
  });

  it("keeps lifetime totals independent from the selected range", () => {
    const stats = aggregate(
      "today",
      { messages: [message()] },
      { messagesTotal: 53725, voiceSessionsTotal: 50 }
    );
    assert.equal(stats.summary.messagesInRange, 1);
    assert.equal(stats.summary.messagesTotal, 53725);
    assert.equal(stats.summary.voiceSessionsTotal, 50);
  });

  it("counts voice sessions that started in range and duration for reliable closed sessions", () => {
    const stats = aggregate("7d", {
      voice: [
        voice({
          user_id: "u1",
          joined_at: "2026-08-25T09:00:00.000Z",
          left_at: "2026-08-25T09:10:00.000Z",
        }),
        voice({
          user_id: "u2",
          joined_at: "2026-08-25T10:00:00.000Z",
          left_at: "2026-08-25T10:05:00.000Z",
        }),
        voice({
          user_id: "u3",
          joined_at: "2026-08-01T10:00:00.000Z",
          left_at: "2026-08-01T10:20:00.000Z",
        }),
      ],
    });
    assert.equal(stats.summary.voiceSessionsInRange, 2);
    assert.equal(stats.summary.voiceSecondsClosed, 15 * 60);
    assert.equal(stats.summary.voiceAverageSeconds, 450);
    assert.equal(stats.topUsersByVoiceSeconds[0]?.key, "u1");
    assert.equal(stats.topUsersByVoiceSeconds[0]?.count, 600);
  });

  it("excludes open and overlong closed sessions from voice duration", () => {
    const overlongEnd = new Date(
      new Date("2026-08-20T10:00:00.000Z").getTime() + (MAX_RELIABLE_VOICE_SECONDS + 60) * 1000
    ).toISOString();
    const stats = aggregate("30d", {
      voice: [
        voice({
          user_id: "open",
          joined_at: "2026-08-25T08:00:00.000Z",
          left_at: null,
        }),
        voice({
          user_id: "crash",
          joined_at: "2026-08-20T10:00:00.000Z",
          left_at: overlongEnd,
        }),
        voice({
          user_id: "ok",
          joined_at: "2026-08-25T09:00:00.000Z",
          left_at: "2026-08-25T09:02:00.000Z",
        }),
      ],
    });
    assert.equal(stats.summary.voiceSessionsInRange, 3);
    assert.equal(stats.summary.voiceOpenInRange, 1);
    assert.equal(stats.summary.voiceUnreliableClosed, 1);
    assert.equal(stats.summary.voiceSecondsClosed, 120);
    assert.equal(stats.users.find((row) => row.userId === "ok")?.voiceSeconds, 120);
    assert.equal(stats.users.find((row) => row.userId === "open")?.voiceSeconds, 0);
  });

  it("builds a daily time series for 7d and monthly buckets for all", () => {
    const week = aggregate("7d", {
      messages: [
        message({ created_at: "2026-08-20T10:00:00.000Z" }),
        message({ created_at: "2026-08-25T10:00:00.000Z" }),
      ],
    });
    assert.equal(week.messagesOverTime.length, 7);
    assert.equal(week.messagesOverTime[0]?.key, "2026-08-19");
    assert.equal(week.messagesOverTime.at(-1)?.key, "2026-08-25");
    assert.equal(week.messagesOverTime.find((row) => row.key === "2026-08-20")?.count, 1);
    assert.equal(week.messagesOverTime.find((row) => row.key === "2026-08-21")?.count, 0);

    const all = aggregate("all", {
      messages: [
        message({ created_at: "2024-10-06T12:00:00.000Z" }),
        message({ created_at: "2026-08-25T10:00:00.000Z" }),
      ],
    });
    assert.ok(all.messagesOverTime.length >= 2);
    assert.equal(all.messagesOverTime[0]?.key, "2024-10");
    assert.equal(all.messagesOverTime.at(-1)?.key, "2026-08");
    assert.equal(all.messagesOverTime.find((row) => row.key === "2024-10")?.count, 1);
    assert.equal(all.messagesOverTime.find((row) => row.key === "2026-08")?.count, 1);
  });

  it("aggregates peak hours in the guild timezone", () => {
    const stats = aggregate("today", {
      messages: [message({ created_at: "2026-08-25T10:00:00.000Z" })],
    });
    const noon = stats.peakHours.find((row) => row.hour === 12);
    assert.equal(noon?.count, 1);
  });

  it("returns empty series and users when there is no data", () => {
    const stats = aggregate("7d", {});
    assert.equal(stats.summary.messagesInRange, 0);
    assert.equal(stats.summary.voiceSessionsInRange, 0);
    assert.equal(stats.summary.activeUsers, 0);
    assert.deepEqual(stats.messagesOverTime, []);
    assert.deepEqual(stats.voiceMinutesOverTime, []);
    assert.deepEqual(stats.users, []);
    assert.deepEqual(stats.recent, []);
  });

  it("limits recent activity to the selected range and keeps the latest 30 for all", () => {
    const inRange = message({ created_at: "2026-08-25T10:00:00.000Z", user_id: "u-new" });
    const outOfRange = message({ created_at: "2026-08-01T10:00:00.000Z", user_id: "u-old" });
    const week = aggregate("7d", { messages: [outOfRange, inRange] });
    assert.equal(week.recent.length, 1);
    assert.equal(week.recent[0]?.userId, "u-new");

    const many = Array.from({ length: 40 }, (_, i) =>
      message({
        user_id: `u${i}`,
        created_at: new Date(Date.UTC(2026, 7, 1, i)).toISOString(),
      })
    );
    const all = aggregate("all", { messages: many });
    assert.equal(all.recent.length, DISCORD_RECENT_LIMIT);
    assert.equal(all.recent[0]?.userId, "u39");
  });

  it("includes a voice leave in recent activity even when the session started before the range", () => {
    const stats = aggregate("today", {
      voice: [
        voice({
          user_id: "late",
          joined_at: "2026-08-20T10:00:00.000Z",
          left_at: "2026-08-25T10:00:00.000Z",
        }),
      ],
    });
    assert.equal(stats.summary.voiceSessionsInRange, 0);
    assert.equal(stats.recent.length, 1);
    assert.equal(stats.recent[0]?.type, "voice");
    assert.equal(stats.recent[0]?.userId, "late");
  });

  it("combines per-user message and voice activity", () => {
    const stats = aggregate("7d", {
      messages: [message({ user_id: "u1" }), message({ user_id: "u2" })],
      voice: [
        voice({
          user_id: "u1",
          joined_at: "2026-08-25T11:00:00.000Z",
          left_at: "2026-08-25T11:30:00.000Z",
        }),
      ],
    });
    assert.equal(stats.summary.activeUsers, 2);
    const u1 = stats.users.find((row) => row.userId === "u1");
    assert.equal(u1?.messageCount, 1);
    assert.equal(u1?.voiceSessionCount, 1);
    assert.equal(u1?.voiceSeconds, 1800);
    assert.equal(u1?.lastActivityAt, "2026-08-25T11:30:00.000Z");
  });
});
