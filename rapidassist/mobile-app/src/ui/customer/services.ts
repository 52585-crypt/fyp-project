import type { RequestCategory } from "../../requests/requests.types";

export const customerServices: ReadonlyArray<{ value: RequestCategory; label: string }> = [
  { value: "mechanic", label: "Mechanic" },
  { value: "fuel_delivery", label: "Fuel Delivery" },
  { value: "car_towing", label: "Car Towing" }
];

export function normalizeBookingCategory(value: unknown): RequestCategory {
  const category = Array.isArray(value) ? value[0] : value;
  return customerServices.find(({ value }) => value === category)?.value ?? "car_towing";
}
