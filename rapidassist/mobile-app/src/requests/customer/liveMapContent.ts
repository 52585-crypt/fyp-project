import type { MapCanvasMarker } from "../../components/maps/MapCanvas.types";
import { hasOperationalCoordinates } from "../../services/locationMapPolicy";
import type { Coordinate } from "../../utils/distance";
import type { ServiceRequest } from "../requests.types";
import { providerNoun, type CustomerStage } from "../stages";

/** The parts of the live request state the map needs. */
export type LiveMapState = {
  route: { provider: Coordinate | null; target: Coordinate | null; toDestination: boolean; stale: boolean; route: Coordinate[] };
  towTrip: { route: Coordinate[] };
};

/** Stages shown map-first (live map + bottom sheet); the rest keep the scrolling stage layout. */
export const mapFirstStages: ReadonlyArray<CustomerStage> = ["searching", "no_provider", "assigned", "tracking", "arrived", "vehicle_picked_up"];

function point(l: ServiceRequest["pickupLocation"] | null | undefined) {
  return hasOperationalCoordinates(l) ? { latitude: l.lat, longitude: l.lng } : null;
}

/**
 * Markers + routes for a live request: before assignment the trip itself, afterwards the provider heading to the
 * target. Once a towed vehicle is loaded, the planned pickup → drop-off trip is drawn dotted under the live route.
 */
export function liveMapContent(stage: CustomerStage, request: ServiceRequest, state: LiveMapState) {
  const r = state.route;
  const plannedRoute = stage === "vehicle_picked_up" ? state.towTrip.route : [];
  if (stage === "searching" || stage === "no_provider" || !r.provider) {
    const pickup = point(request.pickupLocation);
    const drop = request.category === "car_towing" ? point(request.destinationLocation) : null;
    const markers: MapCanvasMarker[] = [
      ...(pickup ? [{ id: "pickup", kind: "pickup" as const, coordinate: pickup, label: "Pickup" }] : []),
      ...(drop ? [{ id: "drop", kind: "destination" as const, coordinate: drop }] : [])
    ];
    return { markers, route: [], plannedRoute };
  }
  const start = stage === "vehicle_picked_up" ? point(request.pickupLocation) : null;
  const markers: MapCanvasMarker[] = [
    ...(start ? [{ id: "start", kind: "pickup" as const, coordinate: start, label: "Picked up" }] : []),
    { id: "provider", kind: "provider", coordinate: r.provider, label: r.stale ? "Last known" : providerNoun(request.category) },
    ...(r.target ? [{ id: "target", kind: r.toDestination ? "destination" as const : "pickup" as const, coordinate: r.target, label: r.toDestination ? "Drop-off" : "You" }] : [])
  ];
  return { markers, route: r.route, plannedRoute };
}

