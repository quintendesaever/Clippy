import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMinutesAsHhmm,
  isValidOpenCloseMinutes,
  localDayKey,
  parseHhmm,
  validateVisitHhmm,
  zonedDateFromDayAndMinutes,
} from "./time.js";

const BRUSSELS = "Europe/Brussels";

describe("parseHhmm", () => {
  it("accepts strict 24-hour HH:mm and rejects malformed values", () => {
    assert.equal(parseHhmm("08:00"), 480);
    assert.equal(parseHhmm("00:00"), 0);
    assert.equal(parseHhmm("23:59"), 1439);
    assert.equal(parseHhmm("9:00"), null);
    assert.equal(parseHhmm("24:00"), null);
    assert.equal(parseHhmm("08:60"), null);
    assert.equal(parseHhmm("8:00"), null);
    assert.equal(parseHhmm("08:0"), null);
    assert.equal(parseHhmm(""), null);
  });
});

describe("opening and closing minutes", () => {
  it("requires close after open within the day", () => {
    assert.equal(isValidOpenCloseMinutes(480, 1320), true);
    assert.equal(isValidOpenCloseMinutes(0, 1440), true);
    assert.equal(isValidOpenCloseMinutes(480, 480), false);
    assert.equal(isValidOpenCloseMinutes(1320, 480), false);
    assert.equal(isValidOpenCloseMinutes(-1, 600), false);
    assert.equal(isValidOpenCloseMinutes(0, 1441), false);
  });
});

describe("validateVisitHhmm", () => {
  it("rejects malformed, inverted, overnight, and out-of-hours visits", () => {
    assert.equal(
      validateVisitHhmm({ startRaw: "09:00", endRaw: "12:00", openMinutes: 480, closeMinutes: 1320 }).ok,
      true
    );
    assert.equal(
      validateVisitHhmm({ startRaw: "08:00", endRaw: "22:00", openMinutes: 480, closeMinutes: 1320 }).ok,
      true
    );
    assert.deepEqual(
      validateVisitHhmm({ startRaw: "9:00", endRaw: "12:00", openMinutes: 480, closeMinutes: 1320 }),
      { ok: false, error: "malformed_start" }
    );
    assert.deepEqual(
      validateVisitHhmm({ startRaw: "09:00", endRaw: "24:00", openMinutes: 480, closeMinutes: 1320 }),
      { ok: false, error: "malformed_end" }
    );
    assert.deepEqual(
      validateVisitHhmm({ startRaw: "12:00", endRaw: "09:00", openMinutes: 480, closeMinutes: 1320 }),
      { ok: false, error: "end_not_after_start" }
    );
    assert.deepEqual(
      validateVisitHhmm({ startRaw: "09:00", endRaw: "09:00", openMinutes: 480, closeMinutes: 1320 }),
      { ok: false, error: "end_not_after_start" }
    );
    assert.deepEqual(
      validateVisitHhmm({ startRaw: "07:59", endRaw: "09:00", openMinutes: 480, closeMinutes: 1320 }),
      { ok: false, error: "outside_hours" }
    );
    assert.deepEqual(
      validateVisitHhmm({ startRaw: "21:00", endRaw: "22:01", openMinutes: 480, closeMinutes: 1320 }),
      { ok: false, error: "outside_hours" }
    );
  });
});

describe("local-day conversion", () => {
  it("converts Brussels wall-clock minutes to UTC across DST", () => {
    assert.equal(
      zonedDateFromDayAndMinutes("2026-09-16", 8 * 60, BRUSSELS).toISOString(),
      "2026-09-16T06:00:00.000Z"
    );
    assert.equal(
      zonedDateFromDayAndMinutes("2026-01-15", 8 * 60, BRUSSELS).toISOString(),
      "2026-01-15T07:00:00.000Z"
    );
    assert.equal(
      zonedDateFromDayAndMinutes("2026-10-21", 30, BRUSSELS).toISOString(),
      "2026-10-20T22:30:00.000Z"
    );
  });

  it("assigns late-UTC instants to the next Brussels day", () => {
    const utc = new Date("2026-10-20T22:30:00.000Z");
    assert.equal(localDayKey(utc, BRUSSELS), "2026-10-21");
    assert.notEqual(utc.toISOString().slice(0, 10), localDayKey(utc, BRUSSELS));
  });

  it("round-trips HH:mm formatting for stored minutes", () => {
    assert.equal(formatMinutesAsHhmm(480), "08:00");
    assert.equal(formatMinutesAsHhmm(1320), "22:00");
    assert.equal(parseHhmm(formatMinutesAsHhmm(9 * 60 + 30)), 9 * 60 + 30);
  });
});
