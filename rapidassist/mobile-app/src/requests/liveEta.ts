import type { DrivingRouteMetrics } from "../services/routing";
import { distanceKm, type Coordinate } from "../utils/distance";

/** OSRM is asked for a fresh live ETA at most this often while the provider moves. */
export const LIVE_ETA_INTERVAL_MS = 30_000;
/** Straight-line fallback speed for city driving. */
const FALLBACK_KMH = 30;

export type LiveEta = {
  distance: number;
  minutes: number;
  route: Coordinate[];
  /** True when OSRM failed and this is the straight-line estimate. */
  approximate: boolean;
};

export function straightLineMinutes(km: number) {
  return Math.max(1, Math.round((km / FALLBACK_KMH) * 60));
}

/** Road ETA from OSRM, or the straight-line estimate (no route line) when the routing service fails. */
export async function liveEta(
  from: Coordinate,
  to: Coordinate,
  getRoute: (from: Coordinate, to: Coordinate) => Promise<DrivingRouteMetrics>
): Promise<LiveEta> {
  try {
    const metrics = await getRoute(from, to);
    return {
      distance: metrics.distanceKm,
      minutes: metrics.durationMinutes || straightLineMinutes(distanceKm(from, to)),
      route: metrics.coordinates,
      approximate: false
    };
  } catch {
    const direct = distanceKm(from, to);
    return { distance: direct, minutes: straightLineMinutes(direct), route: [], approximate: true };
  }
}

/**
 * How long to wait before the next OSRM call: 0 for a new trip leg (another request or target, or none yet),
 * otherwise whatever is left of the 30 s interval since the last call.
 */
export function nextEtaDelay(last: { leg: string; at: number } | null, leg: string, now: number, interval = LIVE_ETA_INTERVAL_MS) {
  if (!last || last.leg !== leg) return 0;
  return Math.max(0, last.at + interval - now);
}
