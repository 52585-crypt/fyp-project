import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { getProviderEarnings, getProviderHistory } from "../requests.api";
import type { ProviderEarnings, ServiceRequest } from "../requests.types";

const message = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

function useLoader<T>(fetcher: (token: string) => Promise<T>, fallback: string) {
  const { token } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    if (!token) return;
    try { setData(await fetcher(token)); setError(null); } catch (e) { setError(message(e, fallback)); } finally { setRefreshing(false); }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return { data, error, refreshing, loading: data === null && !error, refresh: () => { setRefreshing(true); void load(); } };
}

export const useProviderHistory = () => useLoader<ServiceRequest[]>(getProviderHistory, "Failed to load job history");
export const useProviderEarnings = () => useLoader<ProviderEarnings>(getProviderEarnings, "Unable to load earnings");
