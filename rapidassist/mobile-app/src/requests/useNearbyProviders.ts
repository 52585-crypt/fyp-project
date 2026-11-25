import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { listNearbyProviders } from "./requests.api";
import type { NearbyProvider, RequestCategory } from "./requests.types";

const REFRESH_MS = 20_000;
/** Wait for the point to settle (pin drags) before querying. */
const SETTLE_MS = 400;

type NearbyState = {
  providers: NearbyProvider[] | null;
  radiusKm: number | null;
  dispatchRadiusKm: number | null;
  expanded: boolean;
  updatedAt: number | null;
};

const EMPTY: NearbyState = { providers: null, radiusKm: null, dispatchRadiusKm: null, expanded: false, updatedAt: null };

/**
 * Online providers near a point for one or more categories, refreshed every 20 s while `enabled` and the screen
 * is focused, and shortly after the point or categories change. With several categories the lists are merged.
 */
export function useNearbyProviders(categories: RequestCategory | readonly RequestCategory[], at: { lat: number; lng: number } | null, enabled: boolean) {
  const { token } = useAuth();
  const [state, setState] = useState<NearbyState>(EMPTY);
  // Starts unfocused: a screen mounted underneath another (e.g. Home below a deep-linked booking) must not poll.
  const [focused, setFocused] = useState(false);
  const lat = at?.lat;
  const lng = at?.lng;
  const key = (typeof categories === "string" ? [categories] : [...categories]).join(",");

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  useEffect(() => {
    if (!enabled || !focused || !token || lat == null || lng == null || !key) return;
    let active = true;
    const list = key.split(",") as RequestCategory[];
    const load = () => Promise.all(list.map((category) => listNearbyProviders(token, { category, lat, lng })))
      .then((results) => {
        if (!active) return;
        setState({
          providers: results.flatMap((r) => r.providers),
          radiusKm: Math.max(...results.map((r) => r.radiusKm)),
          dispatchRadiusKm: results[0].dispatchRadiusKm ?? results[0].radiusKm,
          expanded: results.some((r) => Boolean(r.expanded)),
          updatedAt: Date.now()
        });
      })
      .catch(() => { if (active) setState((v) => ({ ...v, providers: v.providers ?? [] })); });
    let timer: ReturnType<typeof setInterval> | undefined;
    const settle = setTimeout(() => { void load(); timer = setInterval(load, REFRESH_MS); }, SETTLE_MS);
    return () => { active = false; clearTimeout(settle); if (timer) clearInterval(timer); };
  }, [key, enabled, focused, lat, lng, token]);

  return { ...state, loading: enabled && state.providers === null };
}
