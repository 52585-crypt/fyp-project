const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GOOGLE_LOCATION_CACHE_MS, getGoogleLocationCacheCutoff, serializeLocation, isGoogleLocationExpired } = require("../src/services/googleLocationPolicy");
const { ServiceRequest } = require("../src/models/ServiceRequest");
const { resolveGooglePlace, resolveGooglePlaceSelection } = require("../src/services/googlePlaceResolution");
const { autocompleteGooglePlaces, AUTOCOMPLETE_URL, AUTOCOMPLETE_FIELDS } = require("../src/services/googlePlacesAutocomplete");

test("Google coordinates expire at 30 days and a place ID survives", () => {
  const cachedAt = new Date("2026-01-01T00:00:00Z");
  const location = { source: "google_places", placeId: "example", lat: 31, lng: 74, addressText: "Google address", googleContentCachedAt: cachedAt };
  const valid = serializeLocation(location, new Date(+cachedAt + GOOGLE_LOCATION_CACHE_MS - 1));
  assert.equal(valid.lat, 31);
  assert.equal(valid.addressText, null);
  const expired = serializeLocation(location, new Date(+cachedAt + GOOGLE_LOCATION_CACHE_MS));
  assert.equal(expired.lat, null);
  assert.equal(expired.lng, null);
  assert.equal(expired.placeId, "example");
  assert.equal(expired.googleContentExpired, true);
  assert.equal(isGoogleLocationExpired({ ...location, googleContentCachedAt: null }), true);
  assert.equal(+getGoogleLocationCacheCutoff(new Date(+cachedAt + GOOGLE_LOCATION_CACHE_MS)), +cachedAt);
});

test("non-Google and legacy coordinates are unchanged", () => {
  for (const source of [null, "gps", "manual_map", "photon"]) {
    const location = { lat: 31, lng: 74, source, addressText: "address" };
    assert.equal(serializeLocation(location), location);
  }
});

test("request serializer never returns expired Google coordinates", () => {
  const request = new ServiceRequest({ userId: "507f1f77bcf86cd799439011", category: "mechanic", pickupLocation: {
    source: "google_places", placeId: "example", lat: 31, lng: 74, addressText: "test", googleContentCachedAt: new Date("2000-01-01")
  } });
  const result = request.toJSONSafe().pickupLocation;
  assert.equal(result.lat, null);
  assert.equal(result.lng, null);
  assert.equal(result.placeId, "example");
  assert.equal(result.googleContentExpired, true);
});

test("cleaned Google records remain valid while missing non-Google coordinates do not", async () => {
  const base = { userId: "507f1f77bcf86cd799439011", category: "mechanic" };
  const google = new ServiceRequest({ ...base, pickupLocation: { source: "google_places", placeId: "example" } });
  await assert.doesNotReject(google.validate());
  const gps = new ServiceRequest({ ...base, pickupLocation: { source: "gps" } });
  await assert.rejects(gps.validate(), /pickupLocation\.(lat|lng)/);
});

test("place re-resolution requests only coordinates and never reuses stale values", async () => {
  let options;
  const fresh = await resolveGooglePlace("place-123", { apiKey: "test", fetchImpl: async (url, request) => {
    options = request;
    assert.match(url, /place-123$/);
    return { ok: true, json: async () => ({ id: "place-123", location: { latitude: 31, longitude: 74 } }) };
  } });
  assert.equal(options.headers["X-Goog-FieldMask"], "id,location");
  assert.equal(fresh.lat, 31);
  assert.equal(fresh.source, "google_places");
  assert.ok(fresh.googleContentCachedAt instanceof Date);
  assert.equal(isGoogleLocationExpired(fresh), false);
  await assert.rejects(resolveGooglePlace("place-123", { apiKey: "test", fetchImpl: async () => ({ ok: false }) }), /select the location again/);
  await assert.rejects(resolveGooglePlace("place-123", { apiKey: "", fetchImpl: async () => { throw new Error("should not run"); } }), /unavailable/);
});

test("Autocomplete (New) sends a session token and returns only the internal prediction shape", async () => {
  let requestUrl;
  let requestOptions;
  const suggestions = await autocompleteGooglePlaces(" Faisal ", "session-token-0001", {
    apiKey: "test",
    near: { latitude: 33.7, longitude: 73.1 },
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return { ok: true, json: async () => ({ suggestions: [{ placePrediction: {
        placeId: "place-1",
        structuredFormat: { mainText: { text: "Faisal Mosque" }, secondaryText: { text: "Islamabad" } },
        types: ["tourist_attraction"]
      } }] }) };
    }
  });
  assert.equal(requestUrl, AUTOCOMPLETE_URL);
  assert.equal(requestOptions.headers["X-Goog-FieldMask"], AUTOCOMPLETE_FIELDS);
  assert.deepEqual(JSON.parse(requestOptions.body), {
    input: "Faisal",
    sessionToken: "session-token-0001",
    languageCode: "en",
    includeQueryPredictions: false,
    locationBias: { circle: { center: { latitude: 33.7, longitude: 73.1 }, radius: 50000 } }
  });
  assert.deepEqual(suggestions, [{ provider: "google_places", id: "place-1", primaryText: "Faisal Mosque", secondaryText: "Islamabad" }]);
  assert.equal(suggestions[0].types, undefined);
});

test("Place Details selection completes the same session with only required fields", async () => {
  let requestUrl;
  let fieldMask;
  const location = await resolveGooglePlaceSelection("place-1", "session-token-0001", {
    apiKey: "test",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      fieldMask = options.headers["X-Goog-FieldMask"];
      return { ok: true, json: async () => ({ id: "place-1", location: { latitude: 33.7294, longitude: 73.0372 }, formattedAddress: "Faisal Mosque, Islamabad" }) };
    }
  });
  assert.match(requestUrl, /places\/place-1\?sessionToken=session-token-0001$/);
  assert.equal(fieldMask, "id,location,formattedAddress");
  assert.deepEqual(location, { provider: "google_places", id: "place-1", latitude: 33.7294, longitude: 73.0372, address: "Faisal Mosque, Islamabad" });
});
