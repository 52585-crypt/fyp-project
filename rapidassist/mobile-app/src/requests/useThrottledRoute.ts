import { useEffect, useRef, useState } from "react";
import { getDrivingRouteMetrics } from "../services/routing";
import type { Coordinate } from "../utils/distance";
import { liveEta, nextEtaDelay, type LiveEta } from "./liveEta";

const EMPTY_ROUTE: Coordinate[] = [];

type RouteResult = LiveEta & {
  /** The trip leg (request + target) the ETA belongs to; kept while the moving end changes within the leg. */
  leg: string;
  attempt: number;
};

/**
 * Live road route + ETA from a moving point (the provider) to a target, shared by the customer's live request and
 * the provider's job screen. OSRM is asked at most every 30 s per leg (trailing, so the newest position is used);
 * between calls the last result stays. When OSRM fails the straight-line estimate is used (approximate: true).
 * A new leg (another request or target), or retry() after a fallback, is routed at once. `leg` null = idle.
 */
export function useThrottledRoute(from: Coordinate | null, to: Coordinate | null, leg: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<RouteResult | null>(null);
  const lastCall = useRef<{ leg: string; at: number } | null>(null);
  const fromLat = from?.latitude;
  const fromLng = from?.longitude;
  const toLat = to?.latitude;
  const toLng = to?.longitude;

  useEffect(() => {
    if (!leg || fromLat === undefined || fromLng === undefined || toLat === undefined || toLng === undefined) return;
    let active = true;
    const origin = { latitude: fromLat, longitude: fromLng };
    const target = { latitude: toLat, longitude: toLng };
    const run = () => {
      lastCall.current = { leg, at: Date.now() };
      void liveEta(origin, target, getDrivingRouteMetrics).then((eta) => { if (active) setResult({ ...eta, leg, attempt }); });
    };
    // A newer position cancels a pending timer, so the call that finally runs uses the latest position.
    const delay = nextEtaDelay(lastCall.current, leg, Date.now());
    const timer = delay > 0 ? setTimeout(run, delay) : null;
    if (!timer) run();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [attempt, fromLat, fromLng, leg, toLat, toLng]);

  const current = leg && result?.leg === leg ? result : null;
  return {
    loading: Boolean(leg && !current),
    distance: current?.distance ?? null,
    minutes: current?.minutes ?? null,
    route: current?.route ?? EMPTY_ROUTE,
    approximate: current?.approximate ?? false,
    /** After a straight-line fallback: ask OSRM again now, skipping the 30 s wait. */
    retry() {
      if (!current?.approximate || current.attempt !== attempt) return;
      lastCall.current = null;
      setAttempt((value) => value === attempt ? value + 1 : value);
    }
  };
}
