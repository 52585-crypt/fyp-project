// Privacy-safe provider position for the customer map.
//
// The real position is snapped to a fixed ~500 m grid. Snapping is deterministic on purpose: a random offset
// would differ per query, and averaging many queries would converge on the true point. Everything the preview
// returns about a provider's position (approxLocation, distanceBand, list order) is computed from the snapped
// cell, never from the real point. A band computed from the real distance would leak: moving the pickup until
// the band flips traces an exact circle around the provider, and three circles give the exact position.

const GRID_DEG = 0.005; // ≈ 556 m north–south, ≈ 463 m east–west in the twin cities

function snap(value) {
  return Number((Math.round(value / GRID_DEG) * GRID_DEG).toFixed(3));
}

/** Nearest grid point to { lat, lng }, as { latitude, longitude } (app coordinate shape). */
function approxLocation({ lat, lng }) {
  return { latitude: snap(lat), longitude: snap(lng) };
}

const DISTANCE_BANDS = ["under 2 km", "2–5 km", "5–10 km", "10+ km"];

function distanceBand(km) {
  if (km < 2) return DISTANCE_BANDS[0];
  if (km < 5) return DISTANCE_BANDS[1];
  if (km < 10) return DISTANCE_BANDS[2];
  return DISTANCE_BANDS[3];
}

module.exports = { GRID_DEG, DISTANCE_BANDS, approxLocation, distanceBand };
