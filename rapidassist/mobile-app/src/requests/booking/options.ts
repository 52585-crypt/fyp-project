import type { IconName } from "../../design/components/Icon";
import type { FuelType, MechanicIssueCategory, RequestCategory } from "../requests.types";

export const towingProblems = [
  { value: "accident", label: "Accident" },
  { value: "engine_not_starting", label: "Engine not starting" },
  { value: "flat_tyre", label: "Flat Tyre" },
  { value: "battery_dead", label: "Battery Dead" },
  { value: "vehicle_stuck", label: "Vehicle Stuck" },
  { value: "other", label: "Other" }
] as const;

/** Mechanic services map onto the backend's issue categories. */
export const mechanicServices: ReadonlyArray<{ value: MechanicIssueCategory; label: string; subtitle: string; icon: IconName }> = [
  { value: "general_inspection", label: "General Repair", subtitle: "Engine, electrical", icon: "construct-outline" },
  { value: "battery", label: "Battery Jump", subtitle: "Start your vehicle", icon: "battery-charging-outline" },
  { value: "engine", label: "Engine Diagnostics", subtitle: "Scan & check", icon: "speedometer-outline" },
  { value: "tyre", label: "Tyre Change", subtitle: "Puncture / flat", icon: "disc-outline" },
  { value: "brake", label: "Brake Check", subtitle: "Pads & fluid", icon: "stop-circle-outline" },
  { value: "overheating", label: "Overheating", subtitle: "Cooling system", icon: "thermometer-outline" }
];

export const fuelTypes: ReadonlyArray<{ value: FuelType; label: string }> = [{ value: "petrol", label: "Petrol" }, { value: "diesel", label: "Diesel" }];
export const fuelQuantities = ["1", "2", "3", "5", "10"].map((v) => ({ value: v, label: `${v} Ltr` }));
export const vehicleTypes = [{ value: "car", label: "Car", icon: "car-outline" }, { value: "bike", label: "Bike", icon: "bicycle-outline" }] as const;

export const bookingCopy: Record<RequestCategory, { title: string; location: string; action: string; estimateTitle: string }> = {
  car_towing: { title: "Towing Request", location: "Pickup Location", action: "Get Estimate", estimateTitle: "Estimate" },
  fuel_delivery: { title: "Fuel Delivery", location: "Your Location", action: "Continue", estimateTitle: "Confirm Location" },
  mechanic: { title: "Mechanic Services", location: "Service Location", action: "Get Estimate", estimateTitle: "Confirm Request" }
};
