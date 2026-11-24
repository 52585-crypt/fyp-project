// Google Places coordinates can be cached for at most 30 consecutive days.
const GOOGLE_LOCATION_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

function getGoogleLocationCacheCutoff(now = new Date()) {
  return new Date(now.getTime() - GOOGLE_LOCATION_CACHE_MS);
}

function isGoogleLocation(location) {
  return location?.source === "google_places";
}

function getGoogleLocationExpiry(location) {
  if (!isGoogleLocation(location) || !location.googleContentCachedAt) return null;
  const cachedAt = new Date(location.googleContentCachedAt).getTime();
  return Number.isFinite(cachedAt) ? new Date(cachedAt + GOOGLE_LOCATION_CACHE_MS) : null;
}

function isGoogleLocationExpired(location, now = new Date()) {
  if (!isGoogleLocation(location)) return false;
  const expiry = getGoogleLocationExpiry(location);
  const cachedAt = new Date(location.googleContentCachedAt).getTime();
  return !expiry || cachedAt > now.getTime() || expiry.getTime() <= now.getTime();
}

function serializeLocation(location, now = new Date()) {
  if (!location || !isGoogleLocation(location)) return location;
  const expired = isGoogleLocationExpired(location, now);
  return {
    source: "google_places",
    placeId: location.placeId || null,
    lat: expired ? null : location.lat,
    lng: expired ? null : location.lng,
    // Do not retain formatted Places content without a separate policy basis.
    addressText: null,
    googleContentCachedAt: location.googleContentCachedAt || null,
    googleContentExpired: expired
  };
}

module.exports = {
  GOOGLE_LOCATION_CACHE_MS,
  getGoogleLocationCacheCutoff,
  isGoogleLocation,
  getGoogleLocationExpiry,
  isGoogleLocationExpired,
  serializeLocation
};
