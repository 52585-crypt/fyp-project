import { CATEGORY_FOR_SERVICE, nearbyProviderMarkers, SERVICE_FOR_CATEGORY } from "./nearbyProviderMarkers";
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
});
