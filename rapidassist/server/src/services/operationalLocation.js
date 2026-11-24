const { ServiceRequest } = require("../models/ServiceRequest");
const { isGoogleLocationExpired } = require("./googleLocationPolicy");
const { resolveGooglePlace } = require("./googlePlaceResolution");

const inFlight = new Map();
const unavailable = () => Object.assign(new Error("Location needs to be refreshed or selected again."), { statusCode: 503 });
function validCoordinates(location) {
  return Number.isFinite(location?.lat) && Math.abs(location.lat) <= 90 &&
    Number.isFinite(location?.lng) && Math.abs(location.lng) <= 180;
}

async function ensureOperationalLocation(id, field, options = {}) {
  if (!["pickupLocation", "destinationLocation"].includes(field)) throw new Error("Invalid location field");
  const key = `${id}:${field}`;
  if (!options.resolve && inFlight.has(key)) return inFlight.get(key);
  const work = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const request = await ServiceRequest.findById(id);
      const location = request?.[field];
      if (!location) throw unavailable();
      if (location.source !== "google_places") {
        if (!validCoordinates(location)) throw unavailable();
        return request;
      }
      if (!isGoogleLocationExpired(location) && validCoordinates(location)) return request;
      const placeId = location.placeId;
      const condition = { _id: request._id, [`${field}.source`]: "google_places", [`${field}.placeId`]: placeId, [`${field}.googleContentCachedAt`]: location.googleContentCachedAt || null };
      // Remove expired cached content before contacting Google, even on failure.
      await ServiceRequest.updateOne(condition, { $unset: { [`${field}.lat`]: 1, [`${field}.lng`]: 1, [`${field}.addressText`]: 1 } });
      if (!placeId) throw unavailable();
      const fresh = await (options.resolve || resolveGooglePlace)(placeId);
      if (fresh?.source !== "google_places" || fresh.placeId !== placeId || !validCoordinates(fresh)) throw unavailable();
      const updated = await ServiceRequest.findOneAndUpdate(condition, { $set: {
        [`${field}.lat`]: fresh.lat, [`${field}.lng`]: fresh.lng,
        [`${field}.addressText`]: null, [`${field}.googleContentCachedAt`]: new Date()
      } }, { new: true });
      if (updated && validCoordinates(updated[field]) && !isGoogleLocationExpired(updated[field])) return updated;
    }
    throw unavailable();
  })();
  if (!options.resolve) inFlight.set(key, work);
  try { return await work; } finally { if (!options.resolve && inFlight.get(key) === work) inFlight.delete(key); }
}

module.exports = { ensureOperationalLocation, validCoordinates };
