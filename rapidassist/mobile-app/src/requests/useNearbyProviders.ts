import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { rateLimitWait } from "../services/rateLimit";
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
  /** Shown to the user while the server asks us to slow down (429); null otherwise. */
  notice: string | null;
};

const EMPTY: NearbyState = { providers: null, radiusKm: null, dispatchRadiusKm: null, expanded: false, updatedAt: null, notice: null };

/** The server's 429 limit is per user, so the pause is shared by every screen polling nearby providers. */
let pausedUntil = 0;

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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const list = key.split(",") as RequestCategory[];
    const schedule = (ms: number) => { if (active) timer = setTimeout(() => void run(), ms); };
    const run = async () => {
      const wait = pausedUntil - Date.now();
      if (wait > 0) return schedule(wait);
      try {
        const results = await Promise.all(list.map((category) => listNearbyProviders(token, { category, lat, lng })));
        if (!active) return;
        setState({
          providers: results.flatMap((r) => r.providers),
          radiusKm: Math.max(...results.map((r) => r.radiusKm)),
          dispatchRadiusKm: results[0].dispatchRadiusKm ?? results[0].radiusKm,
          expanded: results.some((r) => Boolean(r.expanded)),
          updatedAt: Date.now(),
          notice: null
        });
        schedule(REFRESH_MS);
      } catch (e) {
        if (!active) return;
        // 429: stay quiet for Retry-After and say why; the last list stays on the map.
        const limited = rateLimitWait(e);
        if (limited) pausedUntil = Date.now() + limited.waitMs;
        setState((v) => ({ ...v, providers: v.providers ?? [], notice: limited?.message ?? v.notice }));
        schedule(limited ? limited.waitMs : REFRESH_MS);
      }
    };
    schedule(SETTLE_MS);
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [key, enabled, focused, lat, lng, token]);

  return { ...state, loading: enabled && state.providers === null };
}
