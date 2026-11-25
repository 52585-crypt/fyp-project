import { coordinatesFromLngLat, isValidCoordinates, type Coordinate } from "../utils/distance";

const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";
const routeCache = new Map<string, { expiresAt: number; value: DrivingRouteMetrics }>();
const pendingRoutes = new Map<string, Promise<DrivingRouteMetrics>>();
const ROUTE_CACHE_MS = 20000;

export type DrivingRouteMetrics = {
  coordinates: Coordinate[];
  distanceKm: number;
  durationMinutes: number;
  from: Coordinate;
  to: Coordinate;
};

function routeKey(from: Coordinate, to: Coordinate) {
  const exact = (value: number) => value.toFixed(6);
  return `${exact(from.latitude)},${exact(from.longitude)}:${exact(to.latitude)},${exact(to.longitude)}`;
}

export async function getDrivingDistanceKm(from: Coordinate, to: Coordinate) {
  const metrics = await getDrivingRouteMetrics(from, to);
  return metrics.distanceKm;
}

export async function getDrivingRouteMetrics(from: Coordinate, to: Coordinate) {
  if (!isValidCoordinates(from) || !isValidCoordinates(to)) {
    throw new Error("A road route cannot be calculated for invalid coordinates.");
  }
  const key = routeKey(from, to);
  const cached = routeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = pendingRoutes.get(key);
  if (pending) return pending;
  routeCache.delete(key);
  const request = fetchRouteMetrics(from, to).then((value) => {
    routeCache.set(key, { expiresAt: Date.now() + ROUTE_CACHE_MS, value });
    return value;
  }).finally(() => pendingRoutes.delete(key));
  pendingRoutes.set(key, request);
  return request;
}

const OSRM_TABLE_URL = "https://router.project-osrm.org/table/v1/driving";
const MAX_TABLE_SOURCES = 25;

/**
 * Driving minutes from each origin to one destination in a single OSRM table request (one call for a whole list
 * instead of one route per row). Unreachable or invalid origins give null; a failed request rejects.
 */
export async function getDrivingMinutesTo(origins: readonly Coordinate[], to: Coordinate): Promise<(number | null)[]> {
  if (!isValidCoordinates(to)) throw new Error("A road route cannot be calculated for invalid coordinates.");
  const valid = origins.map((o, i) => ({ o, i })).filter(({ o }) => isValidCoordinates(o)).slice(0, MAX_TABLE_SOURCES);
  const result: (number | null)[] = origins.map(() => null);
  if (!valid.length) return result;
  const exact = (c: Coordinate) => `${c.longitude.toFixed(6)},${c.latitude.toFixed(6)}`;
  const coordinates = [...valid.map(({ o }) => exact(o)), exact(to)].join(";");
  const sources = valid.map((_, k) => k).join(";");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${OSRM_TABLE_URL}/${coordinates}?sources=${sources}&destinations=${valid.length}&annotations=duration`,
      { signal: controller.signal });
    if (!response.ok) throw new Error("The road route service is unavailable right now.");
    const data = await response.json() as { code?: string; durations?: unknown };
    if (data?.code !== "Ok" || !Array.isArray(data.durations)) throw new Error("The road route service returned an error.");
    valid.forEach(({ i }, k) => {
      const seconds = (data.durations as unknown[][])[k]?.[0];
      result[i] = typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0 ? Math.max(1, Math.round(seconds / 60)) : null;
    });
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export function routeMatchesCoordinates(
  route: Pick<DrivingRouteMetrics, "from" | "to"> | null,
  from: Coordinate,
  to: Coordinate
) {
  return Boolean(
    route &&
    routeKey(route.from, route.to) === routeKey(from, to)
  );
}

async function fetchRouteMetrics(from: Coordinate, to: Coordinate) {
  const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    let response: Response;
    try {
      response = await fetch(`${OSRM_ROUTE_URL}/${coordinates}?overview=full&geometries=geojson&steps=true`, { signal: controller.signal });
    } catch {
      if (controller.signal.aborted) throw new Error("The road route request timed out. Please try again.");
      throw new Error("The road route is unavailable. Check your connection and try again.");
    }
    if (!response.ok) throw new Error("The road route service is unavailable right now.");
    const data = await response.json().catch(() => {
      if (controller.signal.aborted) throw new Error("The road route request timed out. Please try again.");
      throw new Error("The road route service returned an invalid response.");
    });
    return parseRoute(data, from, to);
  } finally {
    clearTimeout(timer);
  }
}

function parseRoute(data: {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { type?: string; coordinates?: unknown };
  }>;
}, from: Coordinate, to: Coordinate): DrivingRouteMetrics {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The road route service returned an invalid response.");
  }
  if (data.code !== "Ok") {
    throw new Error(data.code === "NoRoute" ? "No driving route was found between these locations." : "The road route service returned an error.");
  }
  const route = data.routes?.[0];
  const meters = route?.distance;
  const seconds = route?.duration;

  if (!route) throw new Error("No driving route was found between these locations.");
  if (!Number.isFinite(meters) || Number(meters) <= 0) {
    throw new Error("The road route distance is invalid.");
  }
  if (!Number.isFinite(seconds) || Number(seconds) <= 0) throw new Error("The road route duration is invalid.");
  if (route.geometry?.type !== "LineString" || !Array.isArray(route.geometry.coordinates)) {
    throw new Error("The road route geometry is invalid.");
  }

  const routeCoordinates = route.geometry.coordinates.map(coordinatesFromLngLat);
  if (routeCoordinates.length < 2 || routeCoordinates.some((coordinate) => coordinate === null)) {
    throw new Error("The road route geometry is empty or invalid.");
  }

  return {
    coordinates: routeCoordinates as Coordinate[],
    distanceKm: Number(meters) / 1000,
    durationMinutes: Math.max(1, Math.round(Number(seconds) / 60)),
    from: { latitude: from.latitude, longitude: from.longitude },
    to: { latitude: to.latitude, longitude: to.longitude }
  };
}
