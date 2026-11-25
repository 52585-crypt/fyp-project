// RapidAssist launch market: Islamabad + Rawalpindi (twin cities).
// Mirrors server/src/config/serviceArea.js; server/test/serviceArea.test.js keeps the two in sync.

export const CITIES = ["Islamabad", "Rawalpindi"] as const;

/** Faizabad interchange, between both cities. Only used when the user's real location is unknown. */
export const DEFAULT_CENTER = { latitude: 33.66, longitude: 73.08 } as const;

/** Islamabad + Rawalpindi incl. Bahria Town, DHA, PWD and Gulberg Greens. */
export const SERVICE_AREA_BOUNDS = { south: 33.4, north: 33.8, west: 72.8, east: 73.3 } as const;

export const SERVICE_AREA_MESSAGE = "RapidAssist currently serves Islamabad & Rawalpindi only";

export function isInServiceArea(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return latitude >= SERVICE_AREA_BOUNDS.south && latitude <= SERVICE_AREA_BOUNDS.north
    && longitude >= SERVICE_AREA_BOUNDS.west && longitude <= SERVICE_AREA_BOUNDS.east;
}

/** Photon `bbox` parameter: minLon,minLat,maxLon,maxLat. */
export const SERVICE_AREA_BBOX_PARAM = `${SERVICE_AREA_BOUNDS.west},${SERVICE_AREA_BOUNDS.south},${SERVICE_AREA_BOUNDS.east},${SERVICE_AREA_BOUNDS.north}`;
