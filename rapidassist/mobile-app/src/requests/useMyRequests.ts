import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { onReconnected } from "../services/networkManager";
import { useDispatchUpdates } from "./DispatchProvider";
import { listMyRequests } from "./requests.api";
import type { ServiceRequest } from "./requests.types";
import { isActiveRequest } from "./stages";

/** Customer's requests, refreshed on focus, reconnect and dispatch socket revisions. */
export function useMyRequests() {
  const { token, user } = useAuth();
  const { revision } = useDispatchUpdates();
  const [requests, setRequests] = useState<ServiceRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    const run = ++sequence.current;
    try {
      const items = await listMyRequests(token);
      if (run !== sequence.current) return;
      setRequests(items.filter((r) => !user?.id || r.userId === user.id));
      setError(null);
    } catch (e: any) {
      if (run === sequence.current) setError(e?.response?.data?.message || e?.message || "We couldn't load your requests.");
    } finally {
      if (run === sequence.current) setRefreshing(false);
    }
  }, [token, user?.id]);

  useFocusEffect(useCallback(() => {
    void load();
    const stop = onReconnected(load);
    return () => { stop(); sequence.current += 1; };
  }, [load, revision]));

  const active = useMemo(() => (requests ?? []).filter(isActiveRequest), [requests]);
  const history = useMemo(() => (requests ?? []).filter((r) => !isActiveRequest(r)), [requests]);
  return {
    requests, active, history, error, refreshing, loading: requests === null && !error,
    refresh: () => { setRefreshing(true); void load(); },
    replace: (updated: ServiceRequest) => setRequests((c) => c?.map((r) => (r.id === updated.id ? updated : r)) ?? c)
  };
}
