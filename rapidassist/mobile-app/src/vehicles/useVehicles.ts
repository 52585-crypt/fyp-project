import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { createVehicle, deleteVehicle, listMyVehicles } from "./vehicles.api";
import type { Vehicle, VehicleCreateInput } from "./vehicles.types";

const message = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

export function useVehicles() {
  const { token } = useAuth();
  const [items, setItems] = useState<Vehicle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try { setError(null); setItems(await listMyVehicles(token)); } catch (e) { setError(message(e, "Failed to load vehicles")); }
  }, [token]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function remove(id: string) {
    if (!token) return;
    try { await deleteVehicle(token, id); setItems((c) => c?.filter((v) => v.id !== id) ?? c); } catch (e) { setError(message(e, "Delete failed")); }
  }

  async function add(input: VehicleCreateInput) {
    if (!token || busy) return false;
    setBusy(true);
    setError(null);
    try { await createVehicle(token, input); return true; } catch (e) { setError(message(e, "Failed to add vehicle")); return false; } finally { setBusy(false); }
  }

  return { items, error, busy, loading: items === null && !error, reload: load, remove, add };
}
