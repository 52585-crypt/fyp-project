import { useMemo } from "react";
import { hasOperationalCoordinates } from "../services/locationMapPolicy";
import type { Coordinate } from "../utils/distance";
import { useThrottledRoute } from "./useThrottledRoute";
import type { RequestLocation, ServiceRequest } from "./requests.types";

const GPS_FRESHNESS_MS = 45_000;

function useRequestCoordinate(location?: RequestLocation | null): Coordinate | null {
  const latitude = hasOperationalCoordinates(location) ? location.lat : null;
  const longitude = hasOperationalCoordinates(location) ? location.lng : null;
  return useMemo(() => latitude === null || longitude === null ? null : { latitude, longitude }, [latitude, longitude]);
}

/**
 * Live route + ETA from the provider's latest position to the current target (pickup, or the drop-off once a
 * towed vehicle is loaded), via useThrottledRoute (OSRM at most every 30 s, straight-line fallback). Paused while
 * the provider's GPS is stale or the request is closed.
 */
export function useCustomerRoute(request: ServiceRequest | null) {
  const provider = useRequestCoordinate(request?.providerLocation);
  const toDestination = request?.category === "car_towing"
    && ["vehicle_loaded", "reached_destination"].includes(request.status);
  const target = useRequestCoordinate(toDestination ? request.destinationLocation : request?.pickupLocation);
  const lastUpdate = Date.parse(request?.providerLocation?.updatedAt || "");
  const closed = request?.status === "cancelled" || request?.status === "completed";
  const stale = Boolean(provider && (!Number.isFinite(lastUpdate) || Date.now() - lastUpdate > GPS_FRESHNESS_MS));
  const live = Boolean(provider && target && !closed && !stale);
  const leg = live ? JSON.stringify([request?.id, target?.latitude, target?.longitude]) : null;
  const route = useThrottledRoute(provider, target, leg);
  return { provider, target, toDestination, stale, ...route };
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
