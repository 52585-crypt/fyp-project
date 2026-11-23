export type Coordinates = {
  latitude: number;
  longitude: number;
};

// Backward-compatible singular name used by the existing map contracts.
export type Coordinate = Coordinates;

export function isValidCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== "object") return false;
  const coordinate = value as Partial<Coordinates>;
  return (
    typeof coordinate.latitude === "number" &&
    Number.isFinite(coordinate.latitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    typeof coordinate.longitude === "number" &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180
  );
}

export function coordinatesFromUnknown(value: unknown): Coordinates | null {
  if (!isValidCoordinates(value)) return null;
  return { latitude: value.latitude, longitude: value.longitude };
}

export function coordinatesFromLngLat(value: unknown): Coordinates | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  return coordinatesFromUnknown({ longitude: value[0], latitude: value[1] });
}

export function distanceKm(from: Coordinate, to: Coordinate) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

function toRadians(degrees: number) {
  return degrees * (Math.PI / 180);
}
