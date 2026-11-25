import { useCallback, useEffect, useRef, useState } from "react";
import { CURRENT_LOCATION_TIMEOUT_MS, formatAccuracy, getCurrentForegroundLocation } from "../../services/currentLocation";
import { readableAddress } from "../../services/reverseGeocode";
import type { Coordinate } from "../../utils/distance";

/**
 * Home map: the customer's position (asked once on open) plus a recentre action.
 * A coarse fix (e.g. laptop Wi-Fi location) is still used to centre the map, flagged as approximate;
 * booking asks for a precise location or a pin separately.
 */
export function useHomeMap() {
  const [position, setPosition] = useState<Coordinate | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ coordinate: Coordinate; requestId: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** e.g. "8 km" when the position is only approximate. */
  const [approximate, setApproximate] = useState<string | null>(null);
  const alive = useRef(true);

  const locate = useCallback(async () => {
    setLocating(true);
    try {
      const fix = await getCurrentForegroundLocation(undefined, CURRENT_LOCATION_TIMEOUT_MS, { allowApproximate: true });
      if (!alive.current) return;
      const { coordinate } = fix;
      setPosition(coordinate);
      setApproximate(fix.approximate && fix.accuracyMeters != null ? formatAccuracy(fix.accuracyMeters) : null);
      setFocus((f) => ({ coordinate, requestId: (f?.requestId ?? 0) + 1 }));
      setError(null);
      const text = await readableAddress(coordinate);
      if (alive.current) setAddress(text);
    } catch (e: any) {
      if (alive.current) setError(e?.message || "Location unavailable");
    } finally {
      if (alive.current) setLocating(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void locate();
    return () => { alive.current = false; };
  }, [locate]);

  return { position, address, approximate, focus, locating, error, locate };
}
