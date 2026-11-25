import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { listNearbyProviders } from "./requests.api";
import type { NearbyProvider, RequestCategory } from "./requests.types";

const REFRESH_MS = 20_000;

type NearbyState = {
  providers: NearbyProvider[] | null;
  radiusKm: number | null;
  dispatchRadiusKm: number | null;
  expanded: boolean;
  updatedAt: number | null;
};

const EMPTY: NearbyState = { providers: null, radiusKm: null, dispatchRadiusKm: null, expanded: false, updatedAt: null };

/**
 * Online providers near a point for a category, refreshed every 20 s while `enabled` and the screen is focused,
 * and immediately when the point or category changes.
 */
export function useNearbyProviders(category: RequestCategory, at: { lat: number; lng: number } | null, enabled: boolean) {
  const { token } = useAuth();
  const [state, setState] = useState<NearbyState>(EMPTY);
  const [focused, setFocused] = useState(true);
  const lat = at?.lat;
  const lng = at?.lng;

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  useEffect(() => {
    if (!enabled || !focused || !token || lat == null || lng == null) return;
    let active = true;
    const load = () => listNearbyProviders(token, { category, lat, lng })
      .then((r) => {
        if (!active) return;
        setState({
          providers: r.providers,
          radiusKm: r.radiusKm,
          dispatchRadiusKm: r.dispatchRadiusKm ?? r.radiusKm,
          expanded: Boolean(r.expanded),
          updatedAt: Date.now()
        });
      })
      .catch(() => { if (active) setState((v) => ({ ...v, providers: v.providers ?? [] })); });
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { active = false; clearInterval(timer); };
  }, [category, enabled, focused, lat, lng, token]);

  return { ...state, loading: enabled && state.providers === null };
}
