import { NEARBY_REFRESH_MS, nearbyOfflineMessage, nearbyRetryMs } from "./nearbyPolling";

describe("nearby provider polling backoff", () => {
  it("refreshes every 20 s normally and backs off 10 → 160 s after consecutive failures", () => {
    expect(nearbyRetryMs(0)).toBe(NEARBY_REFRESH_MS);
    expect([1, 2, 3, 4, 5, 6, 12].map(nearbyRetryMs)).toEqual([10_000, 20_000, 40_000, 80_000, 160_000, 160_000, 160_000]);
  });
});

describe("offline message", () => {
  it("says when the shown list is from, or that nothing has loaded", () => {
    const at = Date.UTC(2026, 10, 25, 3, 42);
    expect(nearbyOfflineMessage(at, (iso) => iso.slice(11, 16))).toBe("Offline – showing last update from 03:42. Retrying…");
    expect(nearbyOfflineMessage(null, () => "")).toBe("Offline – couldn't load nearby providers yet. Retrying…");
  });
});
