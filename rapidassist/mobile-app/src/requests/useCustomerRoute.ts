import { useEffect, useMemo, useRef, useState } from "react";
import { hasOperationalCoordinates } from "../services/locationMapPolicy";
import { getDrivingRouteMetrics } from "../services/routing";
import type { Coordinate } from "../utils/distance";
import { liveEta, nextEtaDelay, type LiveEta } from "./liveEta";
import type { RequestLocation, ServiceRequest } from "./requests.types";

const GPS_FRESHNESS_MS = 45_000;
const EMPTY_ROUTE: Coordinate[] = [];

function useRequestCoordinate(location?: RequestLocation | null): Coordinate | null {
  const latitude = hasOperationalCoordinates(location) ? location.lat : null;
  const longitude = hasOperationalCoordinates(location) ? location.lng : null;
  return useMemo(() => latitude === null || longitude === null ? null : { latitude, longitude }, [latitude, longitude]);
}

type RouteResult = LiveEta & {
  /** Request + target the ETA belongs to; kept while the provider moves within the same leg. */
  leg: string;
  attempt: number;
};

/**
 * Live route + ETA from the provider's latest position to the current target (pickup, or the drop-off once a
 * towed vehicle is loaded). OSRM is called at most every 30 s per leg (trailing, so the newest position is
 * used); between calls the last ETA stays on screen. When OSRM fails the straight-line estimate is shown.
 */
export function useCustomerRoute(request: ServiceRequest | null) {
  const provider = useRequestCoordinate(request?.providerLocation);
  const toDestination = request?.category === "car_towing"
    && ["vehicle_loaded", "reached_destination"].includes(request.status);
  const target = useRequestCoordinate(toDestination ? request.destinationLocation : request?.pickupLocation);
  const lastUpdate = Date.parse(request?.providerLocation?.updatedAt || "");
  const closed = request?.status === "cancelled" || request?.status === "completed";
  const stale = Boolean(provider && (!Number.isFinite(lastUpdate) || Date.now() - lastUpdate > GPS_FRESHNESS_MS));
  const fromLat = provider?.latitude;
  const fromLng = provider?.longitude;
  const toLat = target?.latitude;
  const toLng = target?.longitude;
  const live = Boolean(provider && target && !closed && !stale);
  const leg = live ? JSON.stringify([request?.id, toLat, toLng]) : null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<RouteResult | null>(null);
  const lastCall = useRef<{ leg: string; at: number } | null>(null);

  useEffect(() => {
    if (!leg || fromLat === undefined || fromLng === undefined || toLat === undefined || toLng === undefined) return;
    let active = true;
    const from = { latitude: fromLat, longitude: fromLng };
    const to = { latitude: toLat, longitude: toLng };
    const run = () => {
      lastCall.current = { leg, at: Date.now() };
      void liveEta(from, to, getDrivingRouteMetrics).then((eta) => { if (active) setResult({ ...eta, leg, attempt }); });
    };
    // A newer position cancels a pending timer, so the call that finally runs uses the latest position.
    const delay = nextEtaDelay(lastCall.current, leg, Date.now());
    const timer = delay > 0 ? setTimeout(run, delay) : null;
    if (!timer) run();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [attempt, fromLat, fromLng, leg, toLat, toLng]);

  const current = leg && result?.leg === leg ? result : null;
  return {
    provider,
    target,
    toDestination,
    stale,
    loading: Boolean(leg && !current),
    distance: current?.distance ?? null,
    minutes: current?.minutes ?? null,
    route: current?.route ?? EMPTY_ROUTE,
    approximate: current?.approximate ?? false,
    retry() {
      if (!current?.approximate || current.attempt !== attempt) return;
      lastCall.current = null; // an explicit retry skips the 30 s wait
      setAttempt((value) => value === attempt ? value + 1 : value);
    }
  };
}

export function customerEta(status: ServiceRequest["status"], route: ReturnType<typeof useCustomerRoute>) {
  if (status === "provider_arrived") return "Arrived";
  if (status === "reached_destination") return "At destination";
  if (status === "cancelled" || ["completed", "service_finished", "work_started", "inspection_started",
    "fuel_delivered", "in_progress", "extra_work_requested", "waiting_user_approval"].includes(status)) return "—";
  if (route.stale) return "GPS delayed";
  if (route.loading) return "Calculating…";
  if (route.minutes === null) return "Pending";
  return `${route.approximate ? "About " : ""}${Math.max(1, Math.round(route.minutes))} min`;
}
