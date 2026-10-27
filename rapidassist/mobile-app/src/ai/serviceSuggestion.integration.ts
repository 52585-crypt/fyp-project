import type { MechanicIssueCategory, RequestCategory } from "../requests/requests.types";
import type { ServiceSuggestion } from "./serviceSuggestion.types";

const serviceIds: Record<RequestCategory, "towing" | "fuel" | "mechanic"> = {
  car_towing: "towing",
  fuel_delivery: "fuel",
  mechanic: "mechanic"
};

const mechanicIssues = new Set<MechanicIssueCategory>([
  "battery",
  "engine",
  "tyre",
  "brake",
  "overheating",
  "general_inspection"
]);

export type AppliedServiceSelection = {
  category: RequestCategory;
  serviceId: "towing" | "fuel" | "mechanic";
  mechanicIssue: MechanicIssueCategory | null;
};

export function selectionFromSuggestion(suggestion: ServiceSuggestion): AppliedServiceSelection | null {
  const category = suggestion.recommendedService;
  if (!category || !Object.hasOwn(serviceIds, category)) return null;

  if (category === "mechanic") {
    if (!suggestion.issueCategory || !mechanicIssues.has(suggestion.issueCategory)) return null;
    return { category, serviceId: serviceIds[category], mechanicIssue: suggestion.issueCategory };
  }

  if (suggestion.issueCategory !== null) return null;
  return { category, serviceId: serviceIds[category], mechanicIssue: null };
}

