// One place for validating coordinates that arrive from clients (query strings and JSON bodies).
//
// A coordinate is accepted only as a number or a numeric string: booleans, arrays (e.g. ?lat=1&lat=2, or ["33.7"],
// which Number() would quietly turn into 33.7), objects and empty strings are rejected. Latitude must be within
// ±90 and longitude within ±180; optionally the point must lie in the Islamabad/Rawalpindi service area.

const { SERVICE_AREA_MESSAGE, isInServiceArea } = require("../config/serviceArea");

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/** A finite number from a number or numeric string, else null. */
function coordinateValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const number = Number(value.trim());
  return Number.isFinite(number) ? number : null;
}

/** { lat, lng } when both are valid and in range, else null. Never throws. */
function readCoordinates(lat, lng) {
  const latitude = coordinateValue(lat);
  const longitude = coordinateValue(lng);
  if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { lat: latitude, lng: longitude };
}

/**
 * { lat, lng } or a 400 error. `message` is the error for missing/invalid coordinates; with `serviceArea: true`
 * a valid point outside Islamabad/Rawalpindi is rejected with the service-area message.
 */
function requireCoordinates(lat, lng, { message = "Valid lat and lng are required", serviceArea = false } = {}) {
  const point = readCoordinates(lat, lng);
  if (!point) throw badRequest(message);
  if (serviceArea && !isInServiceArea(point.lat, point.lng)) throw badRequest(SERVICE_AREA_MESSAGE);
  return point;
}

module.exports = { coordinateValue, readCoordinates, requireCoordinates };
