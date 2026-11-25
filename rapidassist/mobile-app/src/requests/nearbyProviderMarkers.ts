import type { MapCanvasMarker, MapCanvasService } from "../components/maps/MapCanvas.types";
import type { DistanceBand, NearbyProvider, ProviderService, RequestCategory } from "./requests.types";

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

const BAND_ORDER: readonly DistanceBand[] = ["under 2 km", "2–5 km", "5–10 km", "10+ km"];

/** List order: nearest distance band first, then best rated (unrated "new" providers after rated ones), then name. */
export function sortNearbyProviders(providers: readonly NearbyProvider[]): NearbyProvider[] {
  const band = (p: NearbyProvider) => { const i = BAND_ORDER.indexOf(p.distanceBand); return i < 0 ? BAND_ORDER.length : i; };
  const rating = (p: NearbyProvider) => (p.ratingCount > 0 ? p.ratingAvg : -1);
  return [...providers].sort((a, b) => band(a) - band(b) || rating(b) - rating(a) || a.name.localeCompare(b.name));
}
