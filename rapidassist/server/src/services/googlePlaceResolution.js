function validatePlaceId(placeId) {
  if (typeof placeId !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(placeId)) {
    throw Object.assign(new Error("Invalid place ID. Please select the location again."), { statusCode: 400 });
  }
  return placeId;
}

function validateSessionToken(sessionToken) {
  if (typeof sessionToken !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(sessionToken)) {
    throw Object.assign(new Error("Invalid autocomplete session. Start the location search again."), { statusCode: 400 });
  }
  return sessionToken;
}

async function requestPlace(placeId, fields, options = {}) {
  const key = options.apiKey ?? process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) throw Object.assign(new Error("Location service is unavailable. Please select the location again."), { statusCode: 503 });
  validatePlaceId(placeId);
  const sessionToken = options.sessionToken == null ? null : validateSessionToken(options.sessionToken);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const query = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
    const response = await (options.fetchImpl || fetch)(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${query}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": fields }, signal: controller.signal
    });
    if (!response.ok) throw new Error("Place lookup failed");
    const data = await response.json();
    const lat = data?.location?.latitude, lng = data?.location?.longitude;
    if (data?.id !== placeId || !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) throw new Error("Invalid place location");
    return { data, lat, lng };
  } catch {
    throw Object.assign(new Error("Unable to refresh this location. Please select the location again."), { statusCode: 503 });
  } finally { clearTimeout(timer); }
}

// This service does not write to the database. Callers must authorize the
// request and atomically replace an expired location only after success.
async function resolveGooglePlace(placeId, options = {}) {
  const { lat, lng } = await requestPlace(placeId, "id,location", options);
  return { source: "google_places", placeId, lat, lng, addressText: null, googleContentCachedAt: new Date() };
}

async function resolveGooglePlaceSelection(placeId, sessionToken, options = {}) {
  const { data, lat, lng } = await requestPlace(placeId, "id,location,formattedAddress", { ...options, sessionToken });
  return {
    provider: "google_places",
    id: placeId,
    latitude: lat,
    longitude: lng,
    address: typeof data.formattedAddress === "string" ? data.formattedAddress : undefined
  };
}

module.exports = { resolveGooglePlace, resolveGooglePlaceSelection, validatePlaceId, validateSessionToken };
