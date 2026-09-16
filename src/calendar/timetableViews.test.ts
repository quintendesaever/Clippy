import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ButtonStyle } from "discord.js";
import { serializeEventForApi } from "./serializeEvent.js";
import { makeEvent, makeTimetable } from "./timetableTestFixtures.js";
import { assembleTimetableView } from "./timetableViews.js";

describe("timetable dashboard links", () => {
  it("renders direct Discord link buttons without interaction custom ids", () => {
    const timetable = makeTimetable([makeEvent()]);
    const view = assembleTimetableView(timetable, "2026-08-17", Buffer.from("png"));
    const buttons = view.components.flatMap((row) => row.components);
    const full = buttons.find((button) => "label" in button && button.label === "Volledig Rooster");
    const settings = buttons.find((button) => "label" in button && button.label === "Instellingen");

    assert.equal(full?.style, ButtonStyle.Link);
    assert.match(("url" in (full ?? {}) ? full.url : "") ?? "", /\/timetable$/);
    assert.equal("custom_id" in (full ?? {}), false);

    assert.equal(settings?.style, ButtonStyle.Link);
    assert.match(("url" in (settings ?? {}) ? settings.url : "") ?? "", /\/settings$/);
    assert.equal("custom_id" in (settings ?? {}), false);
  });
});

describe("serializeEventForApi location privacy", () => {
  const ics = makeEvent({
    userId: "owner",
    location: "Campus Sterre",
    description: "Locatie: B22.0.10\nBring laptop",
  });

  it("hides class location from other members when sharing is off", () => {
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

  it("exposes class location to peers when sharing is on, without visitor location", () => {
    const dto = serializeEventForApi(ics, {
      viewerUserId: "other",
      shareLocationByUser: new Map([["owner", true]]),
      memberGeoByUser: new Map([["owner", { city: "Gent", region: null, country: "BE" }]]),
    });
    assert.equal(dto.location, "Campus Sterre");
    assert.equal("memberLocation" in dto, false);
    assert.equal(dto.locationSharingDisabled, false);
  });

  it("lets the owner see class location without exposing visitor location", () => {
    const dto = serializeEventForApi(ics, {
      viewerUserId: "owner",
      shareLocationByUser: new Map([["owner", false]]),
      memberGeoByUser: new Map([["owner", { city: "Gent", region: null, country: "BE" }]]),
    });
    assert.equal(dto.location, "Campus Sterre");
    assert.equal("memberLocation" in dto, false);
    assert.equal(dto.locationSharingDisabled, false);
  });

  it("lets admins see class location, visitor location, and a sharing-off indicator", () => {
    const adminDto = serializeEventForApi(ics, {
      viewerUserId: "other",
      viewerIsAdmin: true,
      shareLocationByUser: new Map([["owner", false]]),
      memberGeoByUser: new Map([["owner", { city: "Gent", region: null, country: "BE" }]]),
    });
    assert.equal(adminDto.location, "Campus Sterre");
    assert.equal(adminDto.memberLocation, "Gent, BE");
    assert.equal(adminDto.locationSharingDisabled, true);
    assert.equal(adminDto.locationHidden, false);
  });

  it("flags sharing-off for admins when location is only in the description", () => {
    const descriptionOnly = makeEvent({
      userId: "owner",
      location: undefined,
      description: "Locatie: B22.0.10\nBring laptop",
    });
    const adminDto = serializeEventForApi(descriptionOnly, {
      viewerUserId: "other",
      viewerIsAdmin: true,
      shareLocationByUser: new Map([["owner", false]]),
    });
    assert.equal(adminDto.location, null);
    assert.equal(adminDto.locationHidden, false);
    assert.equal(adminDto.locationSharingDisabled, true);
    assert.match(adminDto.description ?? "", /B22\.0\.10/);
  });

  it("hides activity venues from peers when sharing is off", () => {
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
    assert.equal(dto.location, null);
    assert.equal(dto.locationHidden, true);
    assert.equal("memberLocation" in dto, false);
  });

  it("shows activity venues to peers when sharing is on", () => {
    const activity = makeEvent({
      userId: "owner",
      createdBy: "owner",
      source: "activity",
      location: "Café X",
      title: "Kotavond",
    });
    const dto = serializeEventForApi(activity, {
      viewerUserId: "other",
      shareLocationByUser: new Map([["owner", true]]),
    });
    assert.equal(dto.location, "Café X");
    assert.equal(dto.locationHidden, false);
  });
});
