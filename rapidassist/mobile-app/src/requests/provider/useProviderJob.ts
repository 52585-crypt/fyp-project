import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { successFeedback } from "../../design/haptics";
import { hasOperationalCoordinates } from "../../services/locationMapPolicy";
import { getDrivingRouteMetrics } from "../../services/routing";
import type { Coordinate } from "../../utils/distance";
import { openExternalNavigation } from "../../utils/navigation";
import { useDispatchUpdates } from "../DispatchProvider";
import { getRequest, requestExtraWork, updateRequestStatus } from "../requests.api";
import type { ExtraWorkInput, RequestLocation, ServiceRequest } from "../requests.types";
import { getProviderStage, providerNextStatus } from "../stages";

const REFRESH_MS = 5000;
const message = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;
const coord = (l?: RequestLocation | null): Coordinate | null => (hasOperationalCoordinates(l) ? { latitude: l.lat, longitude: l.lng } : null);

/** Assigned job for the provider: polling, route to the next stop, advance/cancel/extra-work actions. */
export function useProviderJob(requestId: string | null) {
  const { token, user } = useAuth();
  const { revision, refresh: refreshDispatch } = useDispatchUpdates();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(requestId ? null : "This job link is invalid.");
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [route, setRoute] = useState<{ coords: Coordinate[]; minutes: number | null; km: number | null }>({ coords: [], minutes: null, km: null });
  const sequence = useRef(0);

  const load = useCallback(async () => {
    if (!token || !requestId) return;
    const run = ++sequence.current;
    try {
      const r = await getRequest(token, requestId);
      if (run !== sequence.current) return;
      if (r.providerId !== user?.id) { setLoadError("This job is not assigned to you."); setRequest(null); return; }
      setRequest(r);
      setLoadError(null);
    } catch (e) { if (run === sequence.current) setLoadError(message(e, "Failed to load job")); }
  }, [requestId, token, user?.id]);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { clearInterval(timer); sequence.current += 1; };
  }, [load, revision]));

  const toDestination = request?.category === "car_towing" && ["vehicle_loaded", "reached_destination"].includes(request.status);
  const from = coord(request?.providerLocation);
  const to = coord(toDestination ? request?.destinationLocation : request?.pickupLocation);
  const closed = request?.status === "completed" || request?.status === "cancelled";
  useEffect(() => {
    let cancelled = false;
    if (!from || !to || closed) { setRoute({ coords: [], minutes: null, km: null }); return; }
    getDrivingRouteMetrics(from, to)
      .then((m) => { if (!cancelled) setRoute({ coords: m.coordinates, minutes: m.durationMinutes, km: m.distanceKm }); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [from?.latitude, from?.longitude, to?.latitude, to?.longitude, closed]); // eslint-disable-line react-hooks/exhaustive-deps

  async function mutate(action: (t: string, r: ServiceRequest) => Promise<ServiceRequest>, fallback: string) {
    if (!token || !request || updating) return false;
    setUpdating(true);
    setError(null);
    try {
      const updated = await action(token, request);
      sequence.current += 1;
      setRequest(updated);
      if (updated.status === "service_finished") successFeedback();
      void refreshDispatch();
      return true;
    } catch (e) { setError(message(e, fallback)); return false; } finally { setUpdating(false); }
  }

  const next = request ? providerNextStatus(request) : null;
  return {
    request, loadError, error, updating, route, toDestination, from, to,
    stage: request ? getProviderStage(request) : null,
    next,
    reload: load,
    advance: () => (next ? mutate((t, r) => updateRequestStatus(t, r.id, next), "Failed to update status") : Promise.resolve(false)),
    cancel: (reason: string) => mutate((t, r) => updateRequestStatus(t, r.id, "cancelled", reason.trim() || "Provider cancelled the job"), "Failed to cancel job"),
    requestExtraWork: (input: ExtraWorkInput) => mutate((t, r) => requestExtraWork(t, r.id, input), "Failed to request extra work"),
    /** Google Maps driving directions (native navigation on Android, web fallback) to the pickup or, for towing, the drop-off. */
    navigate: async (to: "pickup" | "destination" = toDestination ? "destination" : "pickup") => {
      const target = to === "destination" ? request?.destinationLocation : request?.pickupLocation;
      if (!target) return setError(to === "destination" ? "This job has no drop-off location." : "The pickup location is unavailable.");
      try { setError(null); await openExternalNavigation(target); }
      catch (e) { setError(message(e, "Failed to open navigation")); }
    }
  };
}

export type ProviderJobState = ReturnType<typeof useProviderJob>;
