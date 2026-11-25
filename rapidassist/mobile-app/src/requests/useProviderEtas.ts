import { useEffect, useMemo, useState } from "react";
import { getDrivingMinutesTo } from "../services/routing";
import type { Coordinate } from "../utils/distance";
import type { NearbyProvider } from "./requests.types";
import type { ProviderEta } from "./useProviderPreview";

/**
 * Road ETAs (minutes) from each provider's approximate location to the pickup, in one OSRM table request.
 * Only refetches when the set of approximate locations or the pickup changes, not on every 20 s refresh.
 */
export function useProviderEtas(providers: readonly NearbyProvider[] | null, pickup: Coordinate | null, enabled: boolean) {
  const [state, setState] = useState<{ key: string; minutes: Record<string, number | null> }>({ key: "", minutes: {} });
  const key = useMemo(() => (!enabled || !pickup || !providers?.length ? "" : JSON.stringify([
    pickup.latitude, pickup.longitude, providers.map((p) => [p.id, p.approxLocation.latitude, p.approxLocation.longitude])
  ])), [enabled, pickup, providers]);

  useEffect(() => {
    if (!key) return;
    const [lat, lng, rows] = JSON.parse(key) as [number, number, [string, number, number][]];
    let active = true;
    getDrivingMinutesTo(rows.map(([, latitude, longitude]) => ({ latitude, longitude })), { latitude: lat, longitude: lng })
      .then((minutes) => { if (active) setState({ key, minutes: Object.fromEntries(rows.map(([id], i) => [id, minutes[i]])) }); })
      .catch(() => { if (active) setState({ key, minutes: {} }); });
    return () => { active = false; };
  }, [key]);

  return (id: string): ProviderEta => ({ minutes: state.minutes[id] ?? null, loading: Boolean(key) && state.key !== key });
}
