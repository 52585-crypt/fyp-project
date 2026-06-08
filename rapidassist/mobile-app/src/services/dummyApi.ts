import type { PaymentMethod, PriceLine, ProviderProfile, RequestStatus, ServiceItem } from "../types";

export const services: ServiceItem[] = [
  { id: "towing", title: "Car Towing", subtitle: "Vehicle towing", icon: "car" },
  { id: "fuel", title: "Fuel Delivery", subtitle: "At your location", icon: "water" },
  { id: "mechanic", title: "Mechanic", subtitle: "On-demand", icon: "construct" },
  { id: "battery", title: "Battery Jump", subtitle: "Start vehicle", icon: "battery-charging" },
  { id: "tyre", title: "Tyre Change", subtitle: "Flat tyre help", icon: "radio-button-on" },
  { id: "lockout", title: "Lockout", subtitle: "Car lock open", icon: "lock-open" }
];

export const demoProvider: ProviderProfile = {
  id: "provider-1",
  name: "Rashid Khan",
  role: "Tow Truck Driver",
  rating: 4.8,
  vehicle: "Tow Truck - Toyota",
  plateNumber: "LES 4567",
  eta: "12 min",
  distance: "3.2 km"
};

export const mechanicProvider: ProviderProfile = {
  id: "mechanic-1",
  name: "Ahmad Raza",
  role: "Expert Mechanic",
  rating: 4.8,
  vehicle: "Mobile mechanic",
  plateNumber: "Verified",
  eta: "12 min",
  distance: "3.2 km"
};

export const estimateLines: PriceLine[] = [
  { label: "Base Fee", amount: 1200 },
  { label: "Distance Charge", amount: 1488 },
  { label: "Waiting Charge", amount: 100 }
];

export async function fakeDelay<T>(payload: T, timeout = 500): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, timeout));
  return payload;
}

export async function requestService() {
  return fakeDelay({ requestId: "RA-2026-0001", status: "searching" as RequestStatus });
}

export async function updatePayment(method: PaymentMethod) {
  return fakeDelay({ method, paid: method === "online" });
}

