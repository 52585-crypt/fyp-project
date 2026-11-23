import { useEffect, useMemo, useState } from "react";
import { hasOperationalCoordinates } from "../services/locationMapPolicy";
import { getDrivingRouteMetrics } from "../services/routing";
import { distanceKm, type Coordinate } from "../utils/distance";
import type { RequestLocation, ServiceRequest } from "./requests.types";

const GPS_FRESHNESS_MS = 45_000;
const EMPTY_ROUTE: Coordinate[] = [];

function useRequestCoordinate(location?: RequestLocation | null): Coordinate | null {
  const latitude = hasOperationalCoordinates(location) ? location.lat : null;
  const longitude = hasOperationalCoordinates(location) ? location.lng : null;
  return useMemo(() => latitude === null || longitude === null ? null : { latitude, longitude }, [latitude, longitude]);
}

type RouteResult = {
  key: string;
  attempt: number;
  distance: number;
  minutes: number;
  route: Coordinate[];
  approximate: boolean;
};

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
  const key = provider && target && !closed && !stale
    ? JSON.stringify([request?.id, fromLat, fromLng, toLat, toLng])
    : null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<RouteResult | null>(null);

  useEffect(() => {
    if (!key || fromLat === undefined || fromLng === undefined || toLat === undefined || toLng === undefined) return;
    let active = true;
    const from = { latitude: fromLat, longitude: fromLng };
    const to = { latitude: toLat, longitude: toLng };

    async function load() {
      if (!key) return;
      try {
        const metrics = await getDrivingRouteMetrics(from, to);
        if (active) setResult({
          key,
          attempt,
          distance: metrics.distanceKm,
          minutes: metrics.durationMinutes || approximateMinutes(distanceKm(from, to)),
          route: metrics.coordinates,
          approximate: false
        });
      } catch {
        const directDistance = distanceKm(from, to);
        if (active) setResult({
          key,
          attempt,
          distance: directDistance,
          minutes: approximateMinutes(directDistance),
          route: EMPTY_ROUTE,
          approximate: true
        });
      }
    }

    void load();
    return () => { active = false; };
  }, [attempt, fromLat, fromLng, key, toLat, toLng]);

  const current = key && result?.key === key ? result : null;
  return {
    provider,
    target,
    toDestination,
    stale,
    loading: Boolean(key && !current),
    distance: current?.distance ?? null,
    minutes: current?.minutes ?? null,
    route: current?.route ?? EMPTY_ROUTE,
    approximate: current?.approximate ?? false,
    retry() {
      if (!current?.approximate || current.attempt !== attempt) return;
      setAttempt((value) => value === attempt ? value + 1 : value);
    }
  };
}

function approximateMinutes(km: number) {
  return Math.max(1, Math.round((km / 30) * 60));
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
