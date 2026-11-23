import type { RequestLocation } from "../requests/requests.types";

// Missing source is legacy/unknown; it is not inferred to be Google-derived.
export function requiresGoogleMap(...locations: Array<{ source?: string | null } | null | undefined>): boolean {
  return locations.some((location) => location?.source === "google_places");
}

export function hasOperationalCoordinates(location?: RequestLocation | null): location is RequestLocation & { lat: number; lng: number } {
  if (!location || location.googleContentExpired === true) return false;
  return typeof location.lat === "number" && Number.isFinite(location.lat) && Math.abs(location.lat) <= 90 &&
    typeof location.lng === "number" && Number.isFinite(location.lng) && Math.abs(location.lng) <= 180;
}
