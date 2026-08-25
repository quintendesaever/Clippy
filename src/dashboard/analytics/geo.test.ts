import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatApproximateLocation, geoFromRequestHeaders, sanitizeReferrer } from "./geo.js";

describe("geoFromRequestHeaders", () => {
  it("reads Cloudflare visitor headers and ignores unknown country", () => {
    const geo = geoFromRequestHeaders({
      "cf-ipcountry": "BE",
      "cf-ipcity": "Ghent",
      "cf-region": "East Flanders",
      "cf-connecting-ip": "1.2.3.4",
    });
    assert.deepEqual(geo, { country: "BE", region: "East Flanders", city: "Ghent" });
  });

  it("treats XX as missing country", () => {
    const geo = geoFromRequestHeaders({ "cf-ipcountry": "XX" });
    assert.equal(geo.country, null);
  });
});

describe("formatApproximateLocation", () => {
  it("joins city, region and country", () => {
    assert.equal(
      formatApproximateLocation({ city: "Gent", region: "Oost-Vlaanderen", country: "BE" }),
      "Gent, Oost-Vlaanderen, BE"
    );
  });

  it("returns null when empty", () => {
    assert.equal(formatApproximateLocation({ city: null, region: null, country: null }), null);
  });
});

describe("sanitizeReferrer", () => {
  it("drops same-origin and credentials", () => {
    assert.equal(sanitizeReferrer("https://dashboard.clippybot.be/timetable", "https://dashboard.clippybot.be"), null);
    assert.equal(
      sanitizeReferrer("https://user:pass@example.com/path?secret=1", "https://dashboard.clippybot.be"),
      "https://example.com/path"
    );
  });
});
