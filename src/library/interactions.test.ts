import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildVisitModal,
  isLibraryButtonId,
  isLibraryModalId,
} from "./view.js";
import { emptyLibrarySettings, isLibraryScheduleActive } from "./settingsPatch.js";
import {
  LIBRARY_CLEAR_BUTTON_ID,
  LIBRARY_END_HOUR_FIELD,
  LIBRARY_END_MINUTE_FIELD,
  LIBRARY_PLAN_BUTTON_ID,
  LIBRARY_START_HOUR_FIELD,
  LIBRARY_START_MINUTE_FIELD,
  LIBRARY_VISIT_MODAL_ID,
} from "./types.js";

describe("library interaction ids", () => {
  it("recognizes plan/clear buttons and the visit modal only", () => {
    assert.equal(isLibraryButtonId(LIBRARY_PLAN_BUTTON_ID), true);
    assert.equal(isLibraryButtonId(LIBRARY_CLEAR_BUTTON_ID), true);
    assert.equal(isLibraryButtonId("timetable:full"), false);
    assert.equal(isLibraryButtonId("library:visit"), false);
    assert.equal(isLibraryModalId(LIBRARY_VISIT_MODAL_ID), true);
    assert.equal(isLibraryModalId("library:plan"), false);
  });

  it("builds a modal with hour and five-minute selectors", () => {
    const json = buildVisitModal().toJSON();
    assert.equal(json.custom_id, LIBRARY_VISIT_MODAL_ID);
    const fields = (json.components ?? []).flatMap((label) =>
      "component" in label ? [label.component] : []
    );
    assert.deepEqual(
      fields.map((field) => ("custom_id" in field ? field.custom_id : null)),
      [
        LIBRARY_START_HOUR_FIELD,
        LIBRARY_START_MINUTE_FIELD,
        LIBRARY_END_HOUR_FIELD,
        LIBRARY_END_MINUTE_FIELD,
      ]
    );
    assert.deepEqual(fields.map((field) => field.type), [3, 3, 3, 3]);
    assert.equal("options" in fields[0]! ? fields[0].options.length : 0, 24);
    assert.deepEqual(
      "options" in fields[1]! ? fields[1].options.map((option) => option.value) : [],
      ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]
    );
  });
});

describe("disabled library interactions", () => {
  it("does not treat a disabled schedule as mutable", () => {
    const disabled = emptyLibrarySettings("g1");
    disabled.message_id = "m1";
    disabled.message_channel_id = "c1";
    assert.equal(isLibraryScheduleActive(disabled), false);
    const enabled = { ...disabled, enabled: true, channel_id: "c1" };
    assert.equal(isLibraryScheduleActive(enabled), true);
  });
});
