import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterPersonalTimetablePayload,
  parseTimetableScope,
  sharedTimetableRequiresIcs,
} from "./timetableScope.js";

describe("parseTimetableScope", () => {
  it("defaults unknown values to shared", () => {
    assert.equal(parseTimetableScope(undefined), "shared");
    assert.equal(parseTimetableScope("shared"), "shared");
    assert.equal(parseTimetableScope("other"), "shared");
    assert.equal(parseTimetableScope(["personal"]), "shared");
  });

  it("accepts personal", () => {
    assert.equal(parseTimetableScope("personal"), "personal");
  });
});

describe("sharedTimetableRequiresIcs", () => {
  it("requires ICS only for shared scope", () => {
    assert.equal(sharedTimetableRequiresIcs("shared"), true);
    assert.equal(sharedTimetableRequiresIcs("personal"), false);
  });
});

describe("filterPersonalTimetablePayload", () => {
  it("returns only the viewer events, activities, and member row", () => {
    const payload = filterPersonalTimetablePayload(
      "viewer",
      {
        viewer: [{ createdBy: "viewer", title: "own-lesson" }],
        peer: [{ createdBy: "peer", title: "peer-lesson" }],
      },
      [
        { createdBy: "viewer", participantIds: [], title: "mine" },
        { createdBy: "peer", participantIds: ["viewer"], title: "joined" },
        { createdBy: "peer", participantIds: ["other"], title: "hidden" },
      ],
      [
        { userId: "viewer", initials: "V" },
        { userId: "peer", initials: "P" },
      ]
    );

    assert.deepEqual(
      payload.events.map((event) => event.title),
      ["own-lesson", "mine", "joined"]
    );
    assert.deepEqual(Object.keys(payload.eventsByUser), ["viewer"]);
    assert.deepEqual(
      payload.activities.map((event) => event.title),
      ["mine", "joined"]
    );
    assert.deepEqual(
      payload.members.map((member) => member.userId),
      ["viewer"]
    );
  });
});
