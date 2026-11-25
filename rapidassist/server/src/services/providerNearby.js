// "Your provider is nearby": sent to the customer once per request, the first time the assigned provider's
// location update lands within NEARBY_KM of the pickup while they are still heading there.
//
// Once-only is enforced by the database, not by memory: the notification is sent only by the update that flips
// providerNearbyNotifiedAt from null in a single conditional write, so concurrent location updates, retries and
// several server processes can never send it twice, and GPS jitter around the 500 m line cannot re-send it.

const { ServiceRequest } = require("../models/ServiceRequest");
const { distanceKm } = require("./dispatch");
const { createNotification } = require("./notifications");

const NEARBY_KM = 0.5;
const EN_ROUTE_STATUSES = ["provider_assigned", "provider_on_way"];

/** True when this location is within NEARBY_KM of the request's pickup (both must have finite coordinates). */
function isNearPickup(request, location) {
  const pickup = request?.pickupLocation;
  if (![pickup?.lat, pickup?.lng, location?.lat, location?.lng].every(Number.isFinite)) return false;
  return distanceKm({ lat: location.lat, lng: location.lng }, { lat: pickup.lat, lng: pickup.lng }) <= NEARBY_KM;
}

/**
 * Called after a provider location update for their active request. Returns true only for the one call that
 * claimed and sent the notification. Notification delivery errors are logged, never thrown at the provider.
 */
async function notifyProviderNearbyOnce(request, provider, location, now = new Date()) {
  if (!request || !EN_ROUTE_STATUSES.includes(request.status) || request.providerNearbyNotifiedAt) return false;
  if (!isNearPickup(request, location)) return false;
  const claimed = await ServiceRequest.findOneAndUpdate(
    { _id: request._id, providerId: provider._id, status: { $in: EN_ROUTE_STATUSES }, providerNearbyNotifiedAt: null },
    { $set: { providerNearbyNotifiedAt: now } },
    { new: true }
  );
  if (!claimed) return false;
  const name = String(provider.name || "").trim().split(/\s+/)[0] || "Your provider";
  try {
    await createNotification({
      userId: claimed.userId,
      type: "provider_nearby",
      title: "Your provider is nearby",
      body: `${name} is less than 500 m away. Please be ready at the pickup point.`,
      data: { requestId: claimed.id, route: "/(user)/tracking" }
    });
  } catch (error) {
    console.error("Provider nearby notification:", error.message);
  }
  return true;
}

module.exports = { NEARBY_KM, EN_ROUTE_STATUSES, isNearPickup, notifyProviderNearbyOnce };
