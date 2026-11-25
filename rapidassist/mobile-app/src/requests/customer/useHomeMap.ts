import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentForegroundLocation, isApproximateFix } from "../../services/currentLocation";
import { readableAddress } from "../../services/reverseGeocode";
import type { Coordinate } from "../../utils/distance";

/** Home map: the customer's GPS position (asked once on open), how precise it is, plus a recentre action. */
export function useHomeMap() {
  const [position, setPosition] = useState<Coordinate | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ coordinate: Coordinate; requestId: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const locate = useCallback(async () => {
    setLocating(true);
    try {
      const { coordinate, accuracyMeters: accuracy } = await getCurrentForegroundLocation();
      if (!alive.current) return;
      setPosition(coordinate);
      setAccuracyMeters(accuracy);
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

  /** True when the fix is coarse (worse than ~100 m); the map then draws a faint accuracy circle. */
  const approximate = isApproximateFix(accuracyMeters);
  return { position, accuracyMeters, approximate, address, focus, locating, error, locate };
}
