import type { RequestCategory } from "../requests.types";
import { providerNoun, type CustomerStage } from "../stages";

/** Short human label for a customer stage (screen titles, list badges). */
export function titleFor(stage: CustomerStage | null, category?: RequestCategory) {
  const who = category ? providerNoun(category) : "Provider";
  switch (stage) {
    case "searching": return `Searching ${who}`;
    case "no_provider": return "No provider found";
    case "assigned": return `${who} Assigned`;
    case "tracking": return "Live Tracking";
    case "arrived": return `${who} Arrived`;
    case "vehicle_picked_up": return "Vehicle Picked Up";
    case "reached_destination": return "Reached Destination";
    case "fuel_delivered": return "Fuel Delivered";
    case "in_progress": return "Work In Progress";
    case "approve_extra_work": return "Extra Work Approval";
    case "confirm_completion": return "Confirm Completion";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    default: return "Request";
  }
}
