import type { Coordinate } from "../utils/distance";

const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";
const routeCache = new Map<string, { expiresAt: number; value: ReturnType<typeof fetchRouteMetrics> }>();
const ROUTE_CACHE_MS = 20000;

function routeKey(from: Coordinate, to: Coordinate) {
  const bucket = (value: number) => Math.round(value / 0.00025);
  return `${bucket(from.latitude)},${bucket(from.longitude)}:${bucket(to.latitude)},${bucket(to.longitude)}`;
}

export async function getDrivingDistanceKm(from: Coordinate, to: Coordinate) {
  const metrics = await getDrivingRouteMetrics(from, to);
  return metrics.distanceKm;
}

export async function getDrivingRouteMetrics(from: Coordinate, to: Coordinate) {
  const key = routeKey(from, to);
  const cached = routeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = fetchRouteMetrics(from, to);
  routeCache.set(key, { expiresAt: Date.now() + ROUTE_CACHE_MS, value });
  try { return await value; }
  catch (error) { routeCache.delete(key); throw error; }
}

async function fetchRouteMetrics(from: Coordinate, to: Coordinate) {
  const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let response: Response;
  try {
    response = await fetch(`${OSRM_ROUTE_URL}/${coordinates}?overview=full&geometries=geojson`, { signal: controller.signal });
  } finally { clearTimeout(timer); }

  if (!response.ok) {
    throw new Error("Route distance is unavailable right now.");
  }

  const data = (await response.json()) as {
    routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates: number[][] } }>;
  };
  const route = data.routes?.[0];
  const meters = route?.distance;
  const seconds = route?.duration;

  if (!Number.isFinite(meters)) {
    throw new Error("Route distance was not found.");
  }

  return {
    coordinates: (route?.geometry?.coordinates || []).map(([longitude, latitude]) => ({ latitude, longitude })),
    distanceKm: Number(meters) / 1000,
    durationMinutes: Number.isFinite(seconds) ? Math.max(1, Math.round(Number(seconds) / 60)) : null
  };
}
