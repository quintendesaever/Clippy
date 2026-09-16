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
  LIBRARY_END_FIELD,
  LIBRARY_PLAN_BUTTON_ID,
  LIBRARY_START_FIELD,
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

  it("builds a modal with exact HH:mm fields and library custom ids", () => {
    const json = buildVisitModal().toJSON();
    assert.equal(json.custom_id, LIBRARY_VISIT_MODAL_ID);
    const fieldIds = (json.components ?? []).flatMap((row) => {
      const components = "components" in row ? row.components : [];
      return components.map((field) => ("custom_id" in field ? field.custom_id : null));
    });
    assert.deepEqual(fieldIds, [LIBRARY_START_FIELD, LIBRARY_END_FIELD]);
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
