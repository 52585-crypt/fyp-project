import type { Coordinate } from "../utils/distance";

const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";

export async function getDrivingDistanceKm(from: Coordinate, to: Coordinate) {
  const metrics = await getDrivingRouteMetrics(from, to);
  return metrics.distanceKm;
}

export async function getDrivingRouteMetrics(from: Coordinate, to: Coordinate) {
  const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const response = await fetch(`${OSRM_ROUTE_URL}/${coordinates}?overview=false`);

  if (!response.ok) {
    throw new Error("Route distance is unavailable right now.");
  }

  const data = (await response.json()) as {
    routes?: Array<{ distance?: number; duration?: number }>;
  };
  const route = data.routes?.[0];
  const meters = route?.distance;
  const seconds = route?.duration;

  if (!Number.isFinite(meters)) {
    throw new Error("Route distance was not found.");
  }

  return {
    distanceKm: Number(meters) / 1000,
    durationMinutes: Number.isFinite(seconds) ? Math.max(1, Math.round(Number(seconds) / 60)) : null
  };
}
