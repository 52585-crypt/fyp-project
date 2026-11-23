import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useVerification } from "../../verification/VerificationProvider";
import { canAcceptServiceRequests } from "../../verification/verification";
import { useDispatchUpdates } from "../DispatchProvider";
import { getProviderEarnings, updateProviderAvailability } from "../requests.api";
import type { ProviderEarnings } from "../requests.types";

const message = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

async function availabilityLocation() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error("GPS location permission is required to go online.");
  const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  let addressText = "Provider live location";
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: current.coords.latitude, longitude: current.coords.longitude });
    const readable = a ? [a.name, a.street, a.city, a.region].filter(Boolean).join(", ") : "";
    if (readable) addressText = readable;
  } catch { /* keep generic label */ }
  return { lat: current.coords.latitude, lng: current.coords.longitude, accuracy: current.coords.accuracy,
    capturedAt: new Date(current.timestamp).toISOString(), addressText };
}

/** Dashboard data: online toggle (GPS + availability API), earnings, offers and verification gate. */
export function useProviderDashboard() {
  const { token } = useAuth();
  const dispatch = useDispatchUpdates();
  const verification = useVerification();
  const canAccept = !verification.loading && !verification.error && canAcceptServiceRequests(verification.status);
  const [earnings, setEarnings] = useState<ProviderEarnings | null>(null);
  const [toggling, setToggling] = useState(false);
  const [area, setArea] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      await Promise.all([dispatch.refresh(), verification.refresh()]);
      setEarnings(await getProviderEarnings(token));
      setError(null);
    } catch (e) { setError(message(e, "Unable to refresh your dashboard.")); } finally { setRefreshing(false); }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { void load(); }, [load, dispatch.online]));

  async function toggleOnline() {
    const next = !dispatch.online;
    if (!token || toggling || (next && !canAccept)) return;
    const previous = dispatch.online;
    dispatch.setOnline(next);
    setToggling(true);
    setError(null);
    try {
      const location = next ? await availabilityLocation() : null;
      if (location) setArea(location.addressText);
      await updateProviderAvailability(token, next, location);
      await dispatch.refresh();
    } catch (e) { dispatch.setOnline(previous); setError(message(e, "Failed to update availability")); } finally { setToggling(false); }
  }

  return {
    online: dispatch.online, offers: dispatch.offers, activeJob: dispatch.activeJob, connected: dispatch.connected,
    dispatchError: dispatch.error, verification, canAccept, earnings, toggling, area, error, refreshing,
    toggleOnline, refresh: () => { setRefreshing(true); void load(); }
  };
}
