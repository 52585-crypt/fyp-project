const { validateSessionToken } = require("./googlePlaceResolution");
const { DEFAULT_CENTER } = require("../config/serviceArea");

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const AUTOCOMPLETE_FIELDS = [
  "suggestions.placePrediction.placeId",
  "suggestions.placePrediction.structuredFormat.mainText.text",
  "suggestions.placePrediction.structuredFormat.secondaryText.text"
].join(",");

function validCoordinate(value, max) {
  return Number.isFinite(value) && Math.abs(value) <= max;
}

async function autocompleteGooglePlaces(input, sessionToken, options = {}) {
  const key = options.apiKey ?? process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) throw Object.assign(new Error("Google Places is not configured."), { statusCode: 503 });
  validateSessionToken(sessionToken);
  const query = typeof input === "string" ? input.trim() : "";
  if (query.length < 3 || query.length > 120) {
    throw Object.assign(new Error("Location query must be between 3 and 120 characters."), { statusCode: 400 });
  }

  const body = { input: query, sessionToken, languageCode: "en", includeQueryPredictions: false };
  const near = options.near;
  if (near && validCoordinate(near.latitude, 90) && validCoordinate(near.longitude, 180)) {
    body.locationBias = { circle: { center: near, radius: 50000 } };
  } else {
    // Unknown user location: bias to the twin-cities service area instead of nowhere.
    body.locationBias = { circle: { center: { latitude: DEFAULT_CENTER.lat, longitude: DEFAULT_CENTER.lng }, radius: 30000 } };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await (options.fetchImpl || fetch)(AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": AUTOCOMPLETE_FIELDS
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) throw new Error("Autocomplete request failed");
    const data = await response.json();
    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
    return suggestions.slice(0, 5).flatMap((item) => {
      const prediction = item?.placePrediction;
      const id = prediction?.placeId;
      const primaryText = prediction?.structuredFormat?.mainText?.text;
      if (typeof id !== "string" || typeof primaryText !== "string" || !primaryText.trim()) return [];
      const secondaryText = prediction?.structuredFormat?.secondaryText?.text;
      return [{
        provider: "google_places",
        id,
        primaryText: primaryText.trim(),
        ...(typeof secondaryText === "string" && secondaryText.trim() ? { secondaryText: secondaryText.trim() } : {})
      }];
    });
  } catch {
    throw Object.assign(new Error("Google Places search is unavailable."), { statusCode: 503 });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { autocompleteGooglePlaces, AUTOCOMPLETE_URL, AUTOCOMPLETE_FIELDS };
