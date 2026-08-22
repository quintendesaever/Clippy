import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { F1_STATS_PREVIEW_CUSTOM_ID } from "./config.js";
import { meetingsFromOpenF1 } from "./schedule.js";
import { buildF1TestPayload } from "./testPayload.js";
import type { OpenF1Session } from "./openf1Client.js";

const meeting = meetingsFromOpenF1([
  {
    session_key: 1,
    session_name: "Qualifying",
    date_start: "2026-08-22T14:00:00.000Z",
    meeting_key: 80,
    year: 2026,
    country_name: "Belgium",
    circuit_short_name: "Spa-Francorchamps",
    location: "Spa-Francorchamps",
  } satisfies OpenF1Session,
  {
    session_key: 2,
    session_name: "Race",
    date_start: "2026-08-23T13:00:00.000Z",
    meeting_key: 80,
    year: 2026,
    country_name: "Belgium",
    circuit_short_name: "Spa-Francorchamps",
    location: "Spa-Francorchamps",
  } satisfies OpenF1Session,
])[0]!;

describe("buildF1TestPayload", () => {
  it("mentions the role and can include the prediction button on reminder stages", () => {
    const payload = buildF1TestPayload({
      stage: "predictions_open",
      meeting,
      timezone: "Europe/Brussels",
      roleId: "role-1",
      predictionUrl: "https://example.com/predict",
      now: new Date("2026-08-19T14:00:00.000Z"),
    });
    assert.match(payload.content, /<@&role-1>/);
    assert.match(payload.content, /\(test\)/);
    assert.equal(payload.components.length, 1);
  });

  it("does not mention the role on results previews and uses the preview stats button", () => {
    const payload = buildF1TestPayload({
      stage: "results",
      meeting,
      timezone: "Europe/Brussels",
      roleId: "role-1",
      predictionUrl: "https://example.com/predict",
    });
    assert.equal(payload.content, "");
    assert.match(payload.embeds[0]!.toJSON().title ?? "", /TEST results preview/);
    const json = payload.components[0]!.toJSON();
    const customId = json.components[0] && "custom_id" in json.components[0] ? json.components[0].custom_id : "";
    assert.equal(customId, F1_STATS_PREVIEW_CUSTOM_ID);
  });

  it("says predictions are locked on the race-soon preview after the deadline", () => {
    const payload = buildF1TestPayload({
      stage: "race_soon",
      meeting,
      timezone: "Europe/Brussels",
      roleId: "role-1",
      predictionUrl: null,
      now: new Date("2026-08-23T12:05:00.000Z"),
    });
    assert.match(payload.content, /<@&role-1>/);
    assert.match(payload.embeds[0]!.toJSON().description ?? "", /locked/i);
  });
});
