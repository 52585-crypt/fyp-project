const DEFAULT_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";
const ROUTE_CACHE_MS = 20000;
const routeCache = new Map();

function routingError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isCoordinate(value) {
  return value &&
    Number.isFinite(Number(value.lat)) &&
    Number(value.lat) >= -90 &&
    Number(value.lat) <= 90 &&
    Number.isFinite(Number(value.lng)) &&
    Number(value.lng) >= -180 &&
    Number(value.lng) <= 180;
}

function routeKey(from, to) {
  const point = (value) => `${Number(value.lat).toFixed(6)},${Number(value.lng).toFixed(6)}`;
  return `${point(from)}:${point(to)}`;
}

async function fetchDrivingRouteMetrics(from, to, { fetchImpl, timeoutMs, routeUrl }) {
  const coordinates = `${Number(from.lng)},${Number(from.lat)};${Number(to.lng)},${Number(to.lat)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(
      `${routeUrl}/${coordinates}?overview=false&steps=false`,
      { signal: controller.signal }
    );
  } catch (error) {
    if (controller.signal.aborted) throw routingError("The road route request timed out. Please try again.");
    throw routingError("The road route service is unavailable. Please try again.");
  } finally {
    clearTimeout(timer);
  }

  if (!response?.ok) throw routingError("The road route service is unavailable. Please try again.");

  let data;
  try {
    data = await response.json();
  } catch {
    throw routingError("The road route service returned an invalid response.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw routingError("The road route service returned an invalid response.");
  }
  if (data.code !== "Ok") {
    throw routingError(
      data.code === "NoRoute"
        ? "No driving route was found between the pickup and destination."
        : "The road route service returned an error.",
      data.code === "NoRoute" ? 422 : 503
    );
  }

  const route = data.routes?.[0];
  if (!route || !Number.isFinite(route.distance) || route.distance <= 0) {
    throw routingError("The road route distance is invalid.");
  }
  if (!Number.isFinite(route.duration) || route.duration <= 0) {
    throw routingError("The road route duration is invalid.");
  }

  return {
    distanceKm: route.distance / 1000,
    durationMinutes: Math.max(1, Math.round(route.duration / 60))
  };
}

async function getDrivingRouteMetrics(from, to, options = {}) {
  if (!isCoordinate(from) || !isCoordinate(to)) {
    throw routingError("Valid pickup and destination coordinates are required.", 400);
  }

  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== "function") throw routingError("The road route service is unavailable. Please try again.");
  const timeoutMs = options.timeoutMs || 12000;
  const routeUrl = options.routeUrl || process.env.OSRM_ROUTE_URL || DEFAULT_ROUTE_URL;
  const canUseSharedCache = !options.fetchImpl && !options.routeUrl && !options.timeoutMs;
  const key = routeKey(from, to);
  const cached = canUseSharedCache ? routeCache.get(key) : null;
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = fetchDrivingRouteMetrics(from, to, { fetchImpl, timeoutMs, routeUrl });
  if (canUseSharedCache) routeCache.set(key, { expiresAt: Date.now() + ROUTE_CACHE_MS, value });
  try {
    return await value;
  } catch (error) {
    if (canUseSharedCache) routeCache.delete(key);
    throw error;
  }
}

module.exports = { getDrivingRouteMetrics };
