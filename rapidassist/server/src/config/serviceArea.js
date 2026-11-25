// RapidAssist launch market: Islamabad + Rawalpindi (twin cities).
// Mirrored in mobile-app/src/config/serviceArea.ts; test/serviceArea.test.js keeps the two in sync.

const CITIES = Object.freeze(["Islamabad", "Rawalpindi"]);

// Faizabad interchange: between both cities. Used only when the user's real location is unknown.
const DEFAULT_CENTER = Object.freeze({ lat: 33.66, lng: 73.08 });

// Islamabad + Rawalpindi incl. Bahria Town, DHA, PWD and Gulberg Greens.
const SERVICE_AREA_BOUNDS = Object.freeze({ south: 33.4, north: 33.8, west: 72.8, east: 73.3 });

const SERVICE_AREA_MESSAGE = "RapidAssist currently serves Islamabad & Rawalpindi only";

function isInServiceArea(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return latitude >= SERVICE_AREA_BOUNDS.south && latitude <= SERVICE_AREA_BOUNDS.north
    && longitude >= SERVICE_AREA_BOUNDS.west && longitude <= SERVICE_AREA_BOUNDS.east;
}

module.exports = { CITIES, DEFAULT_CENTER, SERVICE_AREA_BOUNDS, SERVICE_AREA_MESSAGE, isInServiceArea };
