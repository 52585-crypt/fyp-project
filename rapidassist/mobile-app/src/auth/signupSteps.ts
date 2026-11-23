import type { IconName } from "../design/components/Icon";
import type { MechanicServiceCategory, UserRole } from "./auth.types";

export type SignupStep = "role" | "service" | "details" | "documents" | "location";
export type MechanicPhotoField = "workshopPhotoUrl" | "certificateUrl" | "drivingLicenseUrl";
export type MechanicDocs = Record<MechanicPhotoField, string>;
export type LiveLocation = { lat: number; lng: number; addressText: string | null };

export const customerSteps: SignupStep[] = ["role", "details"];
export const providerSteps: SignupStep[] = ["role", "service", "details", "documents", "location"];
export const stepTitles: Record<SignupStep, string> = {
  role: "Account type", service: "Service", details: "Your details", documents: "Documents", location: "Location"
};

export function stepsFor(role: UserRole) {
  return role === "mechanic" ? providerSteps : customerSteps;
}

export const serviceCategories: ReadonlyArray<{ value: MechanicServiceCategory; label: string; subtitle: string; icon: IconName }> = [
  { value: "mechanic", label: "Car Mechanic", subtitle: "Repairs, battery, diagnostics", icon: "construct-outline" },
  { value: "fuel_delivery", label: "Fuel Delivery", subtitle: "Deliver petrol or diesel", icon: "water-outline" },
  { value: "towing", label: "Tow Driver", subtitle: "Tow vehicles to a workshop", icon: "car-outline" }
];

export function serviceCategoryLabel(category: MechanicServiceCategory) {
  if (category === "fuel_delivery") return "Fuel delivery rider";
  if (category === "towing") return "Towing driver";
  return "Mechanic";
}

/** Documents each provider type must upload before the account is created. */
export function requiredDocuments(category: MechanicServiceCategory): ReadonlyArray<{ field: MechanicPhotoField; title: string; icon: IconName }> {
  return category === "mechanic"
    ? [{ field: "workshopPhotoUrl", title: "Workshop photo", icon: "business-outline" },
       { field: "certificateUrl", title: "Mechanic certificate", icon: "document-text-outline" }]
    : [{ field: "drivingLicenseUrl", title: "Driving licence", icon: "card-outline" }];
}

export const emptyDocs: MechanicDocs = { workshopPhotoUrl: "", certificateUrl: "", drivingLicenseUrl: "" };
