import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { refreshRequestLocation } from "./requests.api";
import type { ServiceRequest } from "./requests.types";
import { hasOperationalCoordinates } from "../services/locationMapPolicy";

type RefreshField = "pickup" | "destination";

export function getActiveLocationRefreshTarget(request: ServiceRequest | null): RefreshField | null {
  if (!request || ["completed", "cancelled"].includes(request.status)) return null;
  const preferred: RefreshField = request.category === "car_towing" && ["vehicle_loaded", "reached_destination", "service_finished"].includes(request.status)
    ? "destination"
    : "pickup";
  const fields: RefreshField[] = preferred === "pickup" ? ["pickup", "destination"] : ["destination", "pickup"];
  return fields.find((field) => {
    const location = field === "pickup" ? request.pickupLocation : request.destinationLocation;
    return location?.source === "google_places" && !hasOperationalCoordinates(location);
  }) || null;
}

function withoutStaleCoordinates(request: ServiceRequest, field: RefreshField): ServiceRequest {
  const key = field === "pickup" ? "pickupLocation" : "destinationLocation";
  const location = request[key];
  if (!location || hasOperationalCoordinates(location)) return request;
  return { ...request, [key]: { ...location, lat: null, lng: null } };
}

export function useActiveLocationRefresh(token: string | null, request: ServiceRequest | null, setRequest: Dispatch<SetStateAction<ServiceRequest | null>>) {
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const attempted = useRef(new Set<string>());
  const field = getActiveLocationRefreshTarget(request);
  const location = field === "pickup" ? request?.pickupLocation : request?.destinationLocation;
  const key = field && request ? `${request.id}:${field}:${location?.placeId || ""}` : null;
  const latest = useRef({ key, token });
  latest.current = { key, token };
  const retry = useCallback(() => { if (key) attempted.current.delete(key); setError(null); setRetryVersion((value) => value + 1); }, [key]);

  useEffect(() => {
    if (!key || !field || !request || !token || attempted.current.has(key)) return;
    attempted.current.add(key);
    setError(null);
    setRequest((previous) => previous?.id === request.id ? withoutStaleCoordinates(previous, field) : previous);
    void refreshRequestLocation(token, request.id, field).then((updated) => {
      const refreshedLocation = field === "pickup" ? updated.pickupLocation : updated.destinationLocation;
      if (!hasOperationalCoordinates(refreshedLocation)) throw new Error("Location refresh returned no coordinates");
      if (latest.current.key === key && latest.current.token === token) setRequest((previous) => previous?.id === updated.id ? updated : previous);
    }).catch(() => { if (latest.current.key === key && latest.current.token === token) setError("Location temporarily unavailable. Retry or select the location again."); });
  }, [key, token, field, retryVersion, setRequest]);

  useEffect(() => { if (!key) setError(null); }, [key]);
  return { locationRefreshError: error, retryLocationRefresh: retry };
}
