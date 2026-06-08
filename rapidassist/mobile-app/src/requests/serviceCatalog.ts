import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import type { MechanicServiceCategory } from "../auth/auth.types";
import type { RequestCategory, RequestStatus } from "./requests.types";

export type ServiceIconName = ComponentProps<typeof Ionicons>["name"];

export type ProviderServiceKey = MechanicServiceCategory;

type ServiceCatalogItem = {
  title: string;
  requestTitle: string;
  providerTitle: string;
  icon: ServiceIconName;
};

export const serviceCatalog: Record<RequestCategory, ServiceCatalogItem> = {
  car_towing: {
    title: "Car Towing",
    requestTitle: "Car towing request",
    providerTitle: "Car towing provider",
    icon: "car"
  },
  fuel_delivery: {
    title: "Fuel Delivery",
    requestTitle: "Fuel delivery request",
    providerTitle: "Fuel delivery provider",
    icon: "water"
  },
  mechanic: {
    title: "Mechanic Service",
    requestTitle: "Mechanic service request",
    providerTitle: "Mechanic service provider",
    icon: "construct"
  }
};

export function requestCategoryFromProviderService(service?: ProviderServiceKey | null): RequestCategory | null {
  if (service === "towing") return "car_towing";
  if (service === "fuel_delivery") return "fuel_delivery";
  if (service === "mechanic") return "mechanic";
  return null;
}

export function providerServiceFromRequestCategory(category?: RequestCategory | string | null): ProviderServiceKey {
  if (category === "car_towing" || category === "towing") return "towing";
  if (category === "fuel_delivery") return "fuel_delivery";
  return "mechanic";
}

export function getServiceTitle(category?: RequestCategory | null) {
  return category ? serviceCatalog[category].title : "Roadside Service";
}

export function getRequestTitle(category?: RequestCategory | null) {
  return category ? serviceCatalog[category].requestTitle : "No matching request";
}

export function getProviderServiceTitle(service?: ProviderServiceKey | null) {
  const category = requestCategoryFromProviderService(service);
  return category ? serviceCatalog[category].providerTitle : "Roadside provider";
}

export function getServiceIcon(category?: RequestCategory | null): ServiceIconName {
  return category ? serviceCatalog[category].icon : "briefcase";
}

export const providerJobFlows: Record<ProviderServiceKey, Array<{ label: string; status: RequestStatus }>> = {
  towing: [
    { label: "On the way", status: "provider_on_way" },
    { label: "Arrived", status: "provider_arrived" },
    { label: "Vehicle loaded", status: "vehicle_loaded" },
    { label: "Reached destination", status: "reached_destination" },
    { label: "Service finished", status: "service_finished" }
  ],
  fuel_delivery: [
    { label: "On the way", status: "provider_on_way" },
    { label: "Arrived", status: "provider_arrived" },
    { label: "Fuel delivered", status: "fuel_delivered" },
    { label: "Service finished", status: "service_finished" }
  ],
  mechanic: [
    { label: "On the way", status: "provider_on_way" },
    { label: "Arrived", status: "provider_arrived" },
    { label: "Inspection started", status: "inspection_started" },
    { label: "Work started", status: "work_started" },
    { label: "Service finished", status: "service_finished" }
  ]
};
