import type { ServiceRequest } from "../requests.types";
import { liveMapContent, mapFirstStages, type LiveMapState } from "./liveMapContent";

const pickup = { lat: 33.7104, lng: 73.0563, addressText: "Blue Area", source: "gps" as const };
const destination = { lat: 33.6938, lng: 73.0369, addressText: "G-8 Markaz", source: "manual_map" as const };
const request = { id: "r1", category: "car_towing", status: "vehicle_loaded", pickupLocation: pickup, destinationLocation: destination } as unknown as ServiceRequest;
const provider = { latitude: 33.7050, longitude: 73.0500 };
const target = { latitude: destination.lat, longitude: destination.lng };
const live = [provider, target];
const planned = [{ latitude: pickup.lat, longitude: pickup.lng }, { latitude: 33.70, longitude: 73.045 }, target];
const state = (over: Partial<LiveMapState["route"]> = {}): LiveMapState => ({
  route: { provider, target, toDestination: true, stale: false, route: live, ...over },
  towTrip: { route: planned }
});

describe("live request map content", () => {
  it("shows a loaded tow on the live map: planned trip dotted, remaining route live, start, truck and drop-off", () => {
    expect(mapFirstStages).toContain("vehicle_picked_up");
    const { markers, route, plannedRoute } = liveMapContent("vehicle_picked_up", request, state());
    expect(plannedRoute).toBe(planned);
    expect(route).toBe(live);
    expect(markers.map((m) => [m.id, m.kind, m.label])).toEqual([
      ["start", "pickup", "Picked up"], ["provider", "provider", "Driver"], ["target", "destination", "Drop-off"]
    ]);
  });

  it("labels a stale position 'Last known' and draws no planned trip before loading", () => {
    expect(liveMapContent("vehicle_picked_up", request, state({ stale: true })).markers[1].label).toBe("Last known");
    const onTheWay = liveMapContent("tracking", { ...request, status: "provider_on_way" } as ServiceRequest, state({ toDestination: false }));
    expect(onTheWay.plannedRoute).toEqual([]);
    expect(onTheWay.markers.map((m) => m.id)).toEqual(["provider", "target"]);
  });
});
