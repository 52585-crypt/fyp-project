import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { successFeedback } from "../design/haptics";
import { verifiedCustomerRequest } from "./customerTrackingSelection";
import { useDispatchUpdates } from "./DispatchProvider";
import { approveExtraWork, getRequest, retryDispatch, updateRequestStatus } from "./requests.api";
import type { ServiceRequest } from "./requests.types";
import { getCustomerStage } from "./stages";
import { trackingLoadFailure } from "./trackingLoadState";
import { useActiveLocationRefresh } from "./useActiveLocationRefresh";
import { customerEta, useCustomerRoute } from "./useCustomerRoute";

const REFRESH_MS = 5000;
type LoadState = "loading" | "loaded" | "failed" | "unavailable";
const message = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

/**
 * Live customer request: polls every 5s while focused (and on dispatch socket revisions),
 * verifies ownership, ignores stale responses, keeps provider location fresh, and exposes actions.
 */
export function useCustomerRequest(requestId: string | null) {
  const { token, user } = useAuth();
  const customerId = user?.id;
  const { revision, connected } = useDispatchUpdates();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [loadState, setLoadState] = useState<LoadState>(requestId ? "loading" : "unavailable");
  const [loadError, setLoadError] = useState<string | null>(requestId ? null : "This link has a missing or invalid request ID.");
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const sequence = useRef(0);
  const { locationRefreshError, retryLocationRefresh } = useActiveLocationRefresh(token, request, setRequest);
  const route = useCustomerRoute(request);

  const load = useCallback(async () => {
    if (!token || !customerId || !requestId) return;
    const run = ++sequence.current;
    try {
      const selected = verifiedCustomerRequest(await getRequest(token, requestId), requestId, customerId);
      if (run !== sequence.current) return;
      setLoadState(selected ? "loaded" : "unavailable");
      setLoadError(selected ? null : "This request is unavailable.");
      setRequest(selected);
    } catch (e) {
      if (run !== sequence.current) return;
      const failure = trackingLoadFailure(e, true);
      setLoadState(failure.kind);
      setLoadError(failure.message);
      if (failure.kind === "unavailable") setRequest(null);
    } finally {
      if (run === sequence.current) setRefreshing(false);
    }
  }, [customerId, requestId, token]);

  useFocusEffect(useCallback(() => {
    if (!requestId) return;
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { clearInterval(timer); sequence.current += 1; };
  }, [load, requestId, revision]));

  /** Runs a mutation, applies the returned request and drops in-flight polls. */
  async function mutate(action: (t: string, r: ServiceRequest) => Promise<ServiceRequest>, fallback: string) {
    if (!token || !request || updating) return false;
    setUpdating(true);
    setError(null);
    try {
      const updated = await action(token, request);
      sequence.current += 1;
      setRequest(updated);
      if (updated.status === "completed") successFeedback();
      return true;
    } catch (e) { setError(message(e, fallback)); return false; } finally { setUpdating(false); }
  }

  return {
    request, loadState, loadError, error, updating, refreshing, connected, route, locationRefreshError,
    stage: request ? getCustomerStage(request) : null,
    eta: request ? customerEta(request.status, route) : "—",
    distance: route.loading ? "Calculating…" : route.distance === null ? "—" : `${route.approximate ? "~" : ""}${route.distance.toFixed(1)} km`,
    refresh: () => { setRefreshing(true); route.retry(); if (locationRefreshError) retryLocationRefresh(); void load(); },
    cancel: (reason: string) => mutate((t, r) => updateRequestStatus(t, r.id, "cancelled", reason.trim() || "User cancelled the request"), "Failed to cancel request"),
    confirmCompletion: () => mutate((t, r) => updateRequestStatus(t, r.id, "completed", "Customer confirmed service completion"), "Failed to complete job"),
    decideExtraWork: (approved: boolean) => mutate((t, r) => approveExtraWork(t, r.id, approved), "Failed to update extra work"),
    retrySearch: () => mutate((t, r) => retryDispatch(t, r.id), "Unable to restart search."),
    retryLocationRefresh,
    applyRequest: setRequest
  };
}

export type CustomerRequestState = ReturnType<typeof useCustomerRequest>;
