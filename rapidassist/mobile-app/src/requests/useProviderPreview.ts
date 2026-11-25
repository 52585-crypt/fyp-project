import { useCallback, useEffect, useState } from "react";
import { getDrivingRouteMetrics } from "../services/routing";
import type { Coordinate } from "../utils/distance";
import { MARKER_ID_PREFIX } from "./nearbyProviderMarkers";
import type { NearbyProvider } from "./requests.types";

export type ProviderEta = { minutes: number | null; loading: boolean };

/** "about 7 min", or null while unknown. The route starts at the approximate (grid-snapped) position, so it is an estimate. */
export function etaLabel(minutes: number | null) {
  return minutes == null ? null : `about ${Math.max(1, Math.round(minutes))} min`;
}

/**
 * The provider whose map marker (or list row) was tapped, kept in step with the 20 s refresh, plus a road ETA
 * from its approximate location to the pickup via the OSRM routing service.
 */
export function useProviderPreview(providers: readonly NearbyProvider[] | null, pickup: Coordinate | null) {
  const [selected, setSelected] = useState<NearbyProvider | null>(null);
  const [eta, setEta] = useState<ProviderEta>({ minutes: null, loading: false });

  /** Accepts a provider id or a map marker id; anything else (e.g. the "me" marker) is ignored. */
  const select = useCallback((id: string) => {
    const key = id.startsWith(MARKER_ID_PREFIX) ? id.slice(MARKER_ID_PREFIX.length) : id;
    const match = providers?.find((p) => p.id === key);
    if (match) setSelected(match);
  }, [providers]);
  const close = useCallback(() => setSelected(null), []);

  // Keep the card's numbers fresh after a refresh; keep the last snapshot if the provider went offline.
  useEffect(() => {
    setSelected((current) => (current ? providers?.find((p) => p.id === current.id) ?? current : current));
  }, [providers]);

  const fromLat = selected?.approxLocation.latitude;
  const fromLng = selected?.approxLocation.longitude;
  const toLat = pickup?.latitude;
  const toLng = pickup?.longitude;
  useEffect(() => {
    if (fromLat == null || fromLng == null || toLat == null || toLng == null) return setEta({ minutes: null, loading: false });
    let active = true;
    setEta({ minutes: null, loading: true });
    getDrivingRouteMetrics({ latitude: fromLat, longitude: fromLng }, { latitude: toLat, longitude: toLng })
      .then((r) => { if (active) setEta({ minutes: r.durationMinutes, loading: false }); })
      .catch(() => { if (active) setEta({ minutes: null, loading: false }); });
    return () => { active = false; };
  }, [fromLat, fromLng, toLat, toLng]);

  return { selected, eta, select, close };
}
