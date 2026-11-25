import { LIVE_ETA_INTERVAL_MS, liveEta, nextEtaDelay, straightLineMinutes } from "./liveEta";

const from = { latitude: 33.7104, longitude: 73.0563 }; // Blue Area
const to = { latitude: 33.7215, longitude: 73.0433 }; // F-7 Markaz, ≈1.7 km away in a straight line

describe("live ETA", () => {
  it("uses the OSRM road route when it answers", async () => {
    const route = [from, to];
    const eta = await liveEta(from, to, async () => ({ coordinates: route, distanceKm: 2.6, durationMinutes: 7, from, to }));
    expect(eta).toEqual({ distance: 2.6, minutes: 7, route, approximate: false });
  });

  it("falls back to the straight-line estimate, with no route line, when OSRM fails", async () => {
    const eta = await liveEta(from, to, async () => { throw new Error("The road route service is unavailable right now."); });
    expect(eta.approximate).toBe(true);
    expect(eta.route).toEqual([]);
    expect(eta.distance).toBeGreaterThan(1.5);
    expect(eta.distance).toBeLessThan(1.9);
    expect(eta.minutes).toBe(straightLineMinutes(eta.distance)); // 30 km/h → about 3–4 min
    expect(eta.minutes).toBeGreaterThanOrEqual(3);
  });

  it("never estimates less than a minute", () => {
    expect(straightLineMinutes(0)).toBe(1);
    expect(straightLineMinutes(15)).toBe(30);
  });

  it("asks OSRM at most every 30 s per leg, immediately for a new leg", () => {
    const leg = JSON.stringify(["req-1", 33.7, 73.05]);
    expect(nextEtaDelay(null, leg, 1_000)).toBe(0);
    expect(nextEtaDelay({ leg, at: 1_000 }, leg, 1_000)).toBe(LIVE_ETA_INTERVAL_MS);
    expect(nextEtaDelay({ leg, at: 1_000 }, leg, 21_000)).toBe(10_000);
    expect(nextEtaDelay({ leg, at: 1_000 }, leg, 45_000)).toBe(0);
    // Towing: the target switches to the drop-off once the vehicle is loaded, so the new leg is routed at once.
    expect(nextEtaDelay({ leg, at: 1_000 }, JSON.stringify(["req-1", 33.6, 73.05]), 2_000)).toBe(0);
  });
});
