import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serializeEventForApi } from "./serializeEvent.js";
import { makeEvent } from "./timetableTestFixtures.js";

describe("serializeEventForApi location privacy", () => {
  const ics = makeEvent({
    userId: "owner",
    location: "Campus Sterre",
    description: "Locatie: B22.0.10\nBring laptop",
  });

  it("hides ICS location from other members when sharing is off", () => {
    const dto = serializeEventForApi(ics, {
      viewerUserId: "other",
      shareLocationByUser: new Map([["owner", false]]),
      memberGeoByUser: new Map([["owner", { city: "Gent", region: null, country: "BE" }]]),
    });
    assert.equal(dto.location, null);
    assert.equal(dto.locationHidden, true);
    assert.equal("memberLocation" in dto, false);
    assert.equal(dto.description?.includes("B22.0.10"), false);
  });

  it("exposes ICS location and member location when sharing is on", () => {
    const dto = serializeEventForApi(ics, {
      viewerUserId: "other",
      shareLocationByUser: new Map([["owner", true]]),
      memberGeoByUser: new Map([["owner", { city: "Gent", region: null, country: "BE" }]]),
    });
    assert.equal(dto.location, "Campus Sterre");
    assert.equal(dto.memberLocation, "Gent, BE");
  });

  it("lets the owner and admins see hidden personal location", () => {
    const hidden = {
      shareLocationByUser: new Map([["owner", false]]),
      memberGeoByUser: new Map([["owner", { city: "Gent", region: null, country: "BE" }]]),
    };
    const ownerDto = serializeEventForApi(ics, { viewerUserId: "owner", ...hidden });
    assert.equal(ownerDto.location, "Campus Sterre");
    assert.equal(ownerDto.memberLocation, "Gent, BE");

    const adminDto = serializeEventForApi(ics, {
      viewerUserId: "other",
      viewerIsAdmin: true,
      ...hidden,
    });
    assert.equal(adminDto.location, "Campus Sterre");
    assert.equal(adminDto.memberLocation, "Gent, BE");
  });

  it("keeps activity venues public even when sharing is off", () => {
    const activity = makeEvent({
      userId: "owner",
      createdBy: "owner",
      source: "activity",
      location: "Café X",
      title: "Kotavond",
    });
    const dto = serializeEventForApi(activity, {
      viewerUserId: "other",
      shareLocationByUser: new Map([["owner", false]]),
      memberGeoByUser: new Map([["owner", { city: "Gent", region: null, country: "BE" }]]),
    });
    assert.equal(dto.location, "Café X");
    assert.equal("memberLocation" in dto, false);
  });
});
