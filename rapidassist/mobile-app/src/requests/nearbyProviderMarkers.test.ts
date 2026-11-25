import { CATEGORY_FOR_SERVICE, nearbyProviderMarkers, SERVICE_FOR_CATEGORY, sortNearbyProviders } from "./nearbyProviderMarkers";
import type { NearbyProvider } from "./requests.types";

const row = (over: Partial<NearbyProvider>): NearbyProvider => ({
  id: "1", name: "Ali", serviceCategory: "mechanic", ratingAvg: 4.5, ratingCount: 3, completedJobs: 7,
  approxLocation: { latitude: 33.7, longitude: 73.05 }, distanceBand: "under 2 km", ...over
});

describe("nearby provider markers", () => {
  it("places each provider at its approximate location with its own service, outside camera fitting", () => {
    expect(nearbyProviderMarkers([row({}), row({ id: "2", serviceCategory: "towing", approxLocation: { latitude: 33.6, longitude: 73.1 } })])).toEqual([
      { id: "provider:1", kind: "provider", service: "mechanic", coordinate: { latitude: 33.7, longitude: 73.05 }, label: "Ali", ambient: true },
      { id: "provider:2", kind: "provider", service: "towing", coordinate: { latitude: 33.6, longitude: 73.1 }, label: "Ali", ambient: true }
    ]);
  });

  it("uses the queried category when a row has no service, and skips rows without a usable location", () => {
    expect(nearbyProviderMarkers([row({ serviceCategory: null })], "car_towing")[0].service).toBe("towing");
    expect(nearbyProviderMarkers([row({ serviceCategory: null })])).toEqual([]);
    expect(nearbyProviderMarkers([row({ approxLocation: { latitude: NaN, longitude: 73 } })])).toEqual([]);
    expect(nearbyProviderMarkers([row({ approxLocation: undefined as never })])).toEqual([]);
  });

  it("maps categories and services both ways", () => {
    for (const [category, service] of Object.entries(SERVICE_FOR_CATEGORY)) expect(CATEGORY_FOR_SERVICE[service]).toBe(category);
  });

  it("sorts the list by distance band, then rating (new providers after rated), then name", () => {
    const list = [
      row({ id: "far", distanceBand: "5–10 km", ratingAvg: 5, ratingCount: 9 }),
      row({ id: "new", distanceBand: "under 2 km", ratingAvg: 0, ratingCount: 0 }),
      row({ id: "ok", distanceBand: "under 2 km", ratingAvg: 3.9, ratingCount: 4 }),
      row({ id: "top", distanceBand: "under 2 km", ratingAvg: 4.8, ratingCount: 12 }),
      row({ id: "mid", distanceBand: "2–5 km", ratingAvg: 4, ratingCount: 2 }),
      row({ id: "edge", distanceBand: "10+ km", ratingAvg: 5, ratingCount: 1 })
    ];
    expect(sortNearbyProviders(list).map((p) => p.id)).toEqual(["top", "ok", "new", "mid", "far", "edge"]);
    expect(list[0].id).toBe("far"); // input untouched
  });
});
