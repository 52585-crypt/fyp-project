import type { AvailableRequestLocation, RequestCategory } from "../requests/requests.types";
import { coordinatesFromUnknown, isValidCoordinates } from "../utils/distance";

export type NormalizedLocation = {
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
  displayName?: string;
  source: "gps" | "manual_map" | "google_places" | "photon" | "unknown";
};

export function normalizeLocation(input: NormalizedLocation): NormalizedLocation {
  if (!isValidCoordinates(input)) {
    throw new Error("Invalid location coordinates");
  }
  return { ...input, address: input.address?.trim() || undefined };
}

export function manualMapLocation(value: unknown, label: string): NormalizedLocation | null {
  const coordinate = coordinatesFromUnknown(value);
  if (!coordinate) return null;
  return normalizeLocation({ ...coordinate, address: label, source: "manual_map" });
}

export function toRequestLocation(location: NormalizedLocation): AvailableRequestLocation {
  const value = normalizeLocation(location);
  return { lat: value.latitude, lng: value.longitude, addressText: value.address || null,
    ...(value.source !== "unknown" ? { source: value.source } : {}), ...(value.placeId ? { placeId: value.placeId } : {}) };
}

export function selectedRequestLocations(
  category: RequestCategory,
  pickup: NormalizedLocation | null,
  destination: NormalizedLocation | null
) {
  if (!pickup || (category === "car_towing" && !destination)) return null;
  return {
    pickupLocation: toRequestLocation(pickup),
    destinationLocation: category === "car_towing" && destination ? toRequestLocation(destination) : null
  };
}

export function applyNormalizedLocationTarget(
  target: "pickup" | "destination",
  location: NormalizedLocation,
  setters: { pickup: (value: NormalizedLocation) => void; destination: (value: NormalizedLocation) => void }
) {
  setters[target](normalizeLocation(location));
}
