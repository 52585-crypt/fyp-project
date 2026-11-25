// Admin heatmap for the twin cities: where requests come from and where online providers are, as counts per
// ~1 km grid cell. Coordinates are bucketed inside MongoDB ($group on the cell index), so raw customer pickup
// points never leave the database or reach the admin panel; only cell centres and counts do.

const { ServiceRequest, REQUEST_CATEGORIES } = require("../models/ServiceRequest");
const { User } = require("../models/User");
const { roleFilter } = require("../utils/accountRoles");
const { SERVICE_AREA_BOUNDS } = require("../config/serviceArea");

// Fixed grid anchored at 0°,0°. 0.009° of latitude ≈ 1.0 km; 0.0108° of longitude ≈ 1.0 km at 33.6° N.
const CELL_LAT_DEG = 0.009;
const CELL_LNG_DEG = 0.0108;
const CELL_KM = 1;
const PROVIDER_FRESH_MS = 3 * 60 * 1000; // same freshness window as dispatch: older positions are not "online here"
const MAX_DAYS = 365;
const DEFAULT_DAYS = 30;
const SERVICE_FOR_CATEGORY = { mechanic: "mechanic", car_towing: "towing", fuel_delivery: "fuel_delivery" };

const round = (value) => Number(value.toFixed(5));

/** Pipeline stages that bucket `<prefix>.lat/.lng` into grid cells inside the service area and count them. */
function cellStages(prefix) {
  const lat = `$${prefix}.lat`;
  const lng = `$${prefix}.lng`;
  return [
    { $match: {
      [`${prefix}.lat`]: { $gte: SERVICE_AREA_BOUNDS.south, $lte: SERVICE_AREA_BOUNDS.north },
      [`${prefix}.lng`]: { $gte: SERVICE_AREA_BOUNDS.west, $lte: SERVICE_AREA_BOUNDS.east }
    } },
    { $group: {
      _id: { y: { $floor: { $divide: [lat, CELL_LAT_DEG] } }, x: { $floor: { $divide: [lng, CELL_LNG_DEG] } } },
      count: { $sum: 1 }
    } },
    { $sort: { count: -1, "_id.y": 1, "_id.x": 1 } }
  ];
}

/** A grouped row as a cell: its centre and count. */
function toCell({ _id, count }) {
  return { lat: round((_id.y + 0.5) * CELL_LAT_DEG), lng: round((_id.x + 0.5) * CELL_LNG_DEG), count };
}

/** Validated query options, or an Error with statusCode 400. */
function heatmapOptions(query = {}) {
  const days = query.days == null || query.days === "" ? DEFAULT_DAYS : Number(query.days);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    throw Object.assign(new Error(`days must be a whole number from 1 to ${MAX_DAYS}`), { statusCode: 400 });
  }
  const category = query.category == null || query.category === "" ? null : String(query.category);
  if (category && !REQUEST_CATEGORIES.includes(category)) {
    throw Object.assign(new Error(`category must be one of ${REQUEST_CATEGORIES.join(", ")}`), { statusCode: 400 });
  }
  return { days, category };
}

async function requestHeatmap({ days = DEFAULT_DAYS, category = null } = {}, now = new Date()) {
  const since = new Date(+now - days * 24 * 60 * 60 * 1000);
  const [requestCells, providerCells] = await Promise.all([
    ServiceRequest.aggregate([
      { $match: { createdAt: { $gte: since }, ...(category ? { category } : {}) } },
      ...cellStages("pickupLocation")
    ]),
    User.aggregate([
      { $match: {
        ...roleFilter("mechanic"),
        verificationStatus: "verified",
        "providerState.isOnline": true,
        "providerState.currentLocation.updatedAt": { $gte: new Date(+now - PROVIDER_FRESH_MS) },
        ...(category ? { "mechanicProfile.serviceCategory": SERVICE_FOR_CATEGORY[category] } : {})
      } },
      ...cellStages("providerState.currentLocation")
    ])
  ]);
  const requests = requestCells.map(toCell);
  const providers = providerCells.map(toCell);
  return {
    cellKm: CELL_KM,
    cell: { latDeg: CELL_LAT_DEG, lngDeg: CELL_LNG_DEG },
    bounds: SERVICE_AREA_BOUNDS,
    days,
    category,
    since: since.toISOString(),
    totals: {
      requests: requests.reduce((sum, c) => sum + c.count, 0),
      onlineProviders: providers.reduce((sum, c) => sum + c.count, 0)
    },
    requests,
    providers
  };
}

module.exports = { CELL_LAT_DEG, CELL_LNG_DEG, heatmapOptions, requestHeatmap };
