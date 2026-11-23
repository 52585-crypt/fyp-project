import type { FuelType, PriceLine, RequestCategory } from "./requests.types";

export const TOWING_RATE_PER_KM = 180;

// The requests API calculates the saved estimate. Keep these local previews in
// parity with the server tariff until an authoritative quote endpoint exists.
export function buildEstimate(category: RequestCategory, roadDistanceKm: number | null, fuelType: FuelType, liters: number) {
  let lines: PriceLine[];

  if (category === "car_towing") {
    if (roadDistanceKm === null || !Number.isFinite(roadDistanceKm) || roadDistanceKm <= 0) return null;
    const distanceKm = Math.max(1, Math.round(roadDistanceKm * 10) / 10);
    lines = [
      { label: "Base towing fee", amount: 1200 },
      { label: `Distance charge (${distanceKm} km)`, amount: Math.round(distanceKm * TOWING_RATE_PER_KM) },
      { label: "Service fee", amount: 250 }
    ];
  } else if (category === "fuel_delivery") {
    if (!Number.isFinite(liters) || liters < 1 || liters > 50) return null;
    const perLiter = fuelType === "diesel" ? 290 : 275;
    lines = [
      { label: `${fuelType === "diesel" ? "Diesel" : "Petrol"} (${liters}L)`, amount: Math.round(perLiter * liters) },
      { label: "Delivery fee", amount: 450 },
      { label: "Service fee", amount: 150 }
    ];
  } else {
    lines = [
      { label: "Inspection fee", amount: 900 },
      { label: "Visit fee", amount: 350 }
    ];
  }

  return {
    lines,
    total: lines.reduce((sum, line) => sum + line.amount, 0)
  };
}
