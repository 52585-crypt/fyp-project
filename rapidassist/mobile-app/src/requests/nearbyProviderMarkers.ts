import type { MapCanvasMarker, MapCanvasService } from "../components/maps/MapCanvas.types";
import type { NearbyProvider, ProviderService, RequestCategory } from "./requests.types";

/** Booking category → the provider service that serves it. */
export const SERVICE_FOR_CATEGORY: Record<RequestCategory, ProviderService> = {
  mechanic: "mechanic",
  car_towing: "towing",
  fuel_delivery: "fuel_delivery"
};

/** Provider service → the booking category a customer requests for it. */
export const CATEGORY_FOR_SERVICE: Record<ProviderService, RequestCategory> = {
  mechanic: "mechanic",
  towing: "car_towing",
  fuel_delivery: "fuel_delivery"
};

export const MARKER_ID_PREFIX = "provider:";

/**
 * Nearby providers as ambient map markers at their approximate (grid-snapped) location. `fallback` covers a
 * provider row without a service (the list was queried for that category anyway).
 */
export function nearbyProviderMarkers(providers: readonly NearbyProvider[], fallback?: RequestCategory): MapCanvasMarker[] {
  return providers.flatMap((p) => {
    const service: MapCanvasService | undefined = p.serviceCategory ?? (fallback ? SERVICE_FOR_CATEGORY[fallback] : undefined);
    const at = p.approxLocation;
    if (!service || !at || !Number.isFinite(at.latitude) || !Number.isFinite(at.longitude)) return [];
    return [{ id: `${MARKER_ID_PREFIX}${p.id}`, kind: "provider", service, coordinate: at, label: p.name, ambient: true }];
  });
}
