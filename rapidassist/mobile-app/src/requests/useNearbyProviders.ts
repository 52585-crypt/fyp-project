import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { listNearbyProviders } from "./requests.api";
import type { NearbyProvider, RequestCategory } from "./requests.types";

const REFRESH_MS = 20_000;

/** Online providers near a point for a category, refreshed while `enabled` (the offers screen). */
export function useNearbyProviders(category: RequestCategory, at: { lat: number; lng: number } | null, enabled: boolean) {
  const { token } = useAuth();
  const [providers, setProviders] = useState<NearbyProvider[] | null>(null);
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const lat = at?.lat;
  const lng = at?.lng;

  useEffect(() => {
    if (!enabled || !token || lat == null || lng == null) return;
    let active = true;
    const load = () => listNearbyProviders(token, { category, lat, lng })
      .then((r) => { if (active) { setProviders(r.providers); setRadiusKm(r.radiusKm); } })
      .catch(() => { if (active) setProviders((v) => v ?? []); });
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { active = false; clearInterval(timer); };
  }, [category, enabled, lat, lng, token]);

  return { providers, radiusKm, loading: enabled && providers === null };
}
