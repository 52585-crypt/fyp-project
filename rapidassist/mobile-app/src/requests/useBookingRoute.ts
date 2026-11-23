import { useEffect, useState } from "react";
import { getDrivingRouteMetrics, routeMatchesCoordinates, type DrivingRouteMetrics } from "../services/routing";
import type { Coordinate } from "../utils/distance";

type Result = { from: Coordinate; to: Coordinate; attempt: number; route?: DrivingRouteMetrics; error?: string };

export function useBookingRoute(pickup: Coordinate | null, destination: Coordinate | null) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const fromLat = pickup?.latitude;
  const fromLng = pickup?.longitude;
  const toLat = destination?.latitude;
  const toLng = destination?.longitude;

  useEffect(() => {
    if (fromLat === undefined || fromLng === undefined || toLat === undefined || toLng === undefined) return;
    const from = { latitude: fromLat, longitude: fromLng };
    const to = { latitude: toLat, longitude: toLng };
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const route = await getDrivingRouteMetrics(from, to);
        if (active) setResult({ from, to, route, attempt });
      } catch (error) {
        if (active) setResult({
          from, to, attempt,
          error: error instanceof Error ? error.message : "The road route is unavailable. Please try again."
        });
      }
    }, 450);
    return () => { active = false; clearTimeout(timer); };
  }, [attempt, fromLat, fromLng, toLat, toLng]);

  const ready = Boolean(pickup && destination);
  const current = pickup && destination && result?.attempt === attempt &&
    routeMatchesCoordinates(result, pickup, destination) ? result : null;
  return {
    route: current?.route ?? null,
    loading: ready && !current,
    error: current?.error ?? null,
    retry() {
      if (current?.error) setAttempt((value) => value === attempt ? value + 1 : value);
    }
  };
}
