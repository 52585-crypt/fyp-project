import { api } from "../config/api";
import type { Vehicle, VehicleCreateInput } from "./vehicles.types";

export async function listMyVehicles(token: string) {
  const res = await api.get<{ ok: boolean; vehicles: Vehicle[] }>("/api/vehicles", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data.vehicles;
}

export async function createVehicle(token: string, input: VehicleCreateInput) {
  const res = await api.post<{ ok: boolean; vehicle: Vehicle }>("/api/vehicles", input, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data.vehicle;
}

export async function deleteVehicle(token: string, vehicleId: string) {
  await api.delete(`/api/vehicles/${vehicleId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

