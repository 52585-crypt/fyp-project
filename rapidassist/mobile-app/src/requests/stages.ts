import type { RequestCategory, RequestStatus, ServiceRequest } from "./requests.types";

/**
 * The ONLY place that maps a request's backend status to what a screen shows.
 * Screens switch on these stages; they never compare raw status strings.
 *
 * Backend transitions (server/src/controllers/requests.controller.js):
 *   provider_assigned → provider_on_way → provider_arrived →
 *     towing:   vehicle_loaded → reached_destination
 *     fuel:     fuel_delivered
 *     mechanic: inspection_started → [extra_work_requested →] work_started
 *   → service_finished → completed (customer confirms). Either side may cancel.
 */

export type CustomerStage =
  | "searching"
  | "no_provider"
  | "assigned"
  | "tracking"
  | "arrived"
  | "vehicle_picked_up"
  | "reached_destination"
  | "fuel_delivered"
  | "in_progress"
  | "approve_extra_work"
  | "confirm_completion"
  | "completed"
  | "cancelled";

type StageInput = Pick<ServiceRequest, "status"> & Partial<Pick<ServiceRequest, "dispatch" | "mechanicDetails" | "category">>;

const customerByStatus: Record<RequestStatus, CustomerStage> = {
  pending: "searching",
  searching_provider: "searching",
  provider_assigned: "assigned",
  provider_on_way: "tracking",
  provider_arrived: "arrived",
  vehicle_loaded: "vehicle_picked_up",
  reached_destination: "reached_destination",
  fuel_delivered: "fuel_delivered",
  inspection_started: "in_progress",
  work_started: "in_progress",
  in_progress: "in_progress",
  waiting_user_approval: "in_progress",
  extra_work_requested: "approve_extra_work",
  service_finished: "confirm_completion",
  completed: "completed",
  cancelled: "cancelled"
};

export function getCustomerStage(request: StageInput): CustomerStage {
  const { status } = request;
  if ((status === "pending" || status === "searching_provider") && request.dispatch?.state === "unavailable") return "no_provider";
  if (status === "waiting_user_approval" && request.mechanicDetails?.extraWork?.status === "pending") return "approve_extra_work";
  return customerByStatus[status] ?? "searching";
}

/** Live request the customer should still be following. */
export function isActiveRequest(request: Pick<ServiceRequest, "status">) {
  return request.status !== "completed" && request.status !== "cancelled";
}

/** Customer may cancel until the provider has arrived on site. */
export function customerCanCancel(stage: CustomerStage) {
  return stage === "searching" || stage === "no_provider" || stage === "assigned" || stage === "tracking";
}

/** Stages that show the live map with the provider position. */
export function showsLiveMap(stage: CustomerStage) {
  return stage === "assigned" || stage === "tracking" || stage === "vehicle_picked_up";
}

// ---------------------------------------------------------------------------
// Trip / order status timeline (Trip Status list in the mockups)

type TimelineStep = { key: string; label: string; statuses: RequestStatus[] };

const people: Record<RequestCategory, string> = { car_towing: "Driver", fuel_delivery: "Rider", mechanic: "Mechanic" };

/** "Driver" / "Rider" / "Mechanic" — what the customer calls their provider. */
export function providerNoun(category: RequestCategory) {
  return people[category];
}

function timelineSteps(category: RequestCategory): TimelineStep[] {
  const who = people[category];
  const head: TimelineStep[] = [
    { key: "confirmed", label: category === "fuel_delivery" ? "Order Confirmed" : "Request Confirmed", statuses: ["pending", "searching_provider"] },
    { key: "assigned", label: `${who} Assigned`, statuses: ["provider_assigned"] },
    { key: "on_way", label: `${who} On The Way`, statuses: ["provider_on_way"] },
    { key: "arrived", label: `${who} Arrived`, statuses: ["provider_arrived"] }
  ];
  const finished: TimelineStep = { key: "completed", label: "Completed", statuses: ["service_finished", "completed"] };
  if (category === "car_towing") {
    return [...head,
      { key: "loaded", label: "Vehicle Picked Up", statuses: ["vehicle_loaded"] },
      { key: "destination", label: "Reached Destination", statuses: ["reached_destination"] },
      finished];
  }
  if (category === "fuel_delivery") {
    return [...head, { key: "delivered", label: "Fuel Delivered", statuses: ["fuel_delivered"] }, finished];
  }
  return [...head,
    { key: "inspection", label: "Inspection Started", statuses: ["inspection_started", "extra_work_requested", "waiting_user_approval"] },
    { key: "work", label: "Service Started", statuses: ["work_started", "in_progress"] },
    finished];
}

export type StageTimelineItem = { key: string; label: string; at: string | null; state: "done" | "current" | "todo" };

/** Ordered status list for the request's category with done/current/todo state and server timestamps. */
export function requestTimeline(request: Pick<ServiceRequest, "status" | "category" | "statusTimeline" | "createdAt">): StageTimelineItem[] {
  const steps = timelineSteps(request.category);
  const current = Math.max(0, steps.findIndex((s) => s.statuses.includes(request.status)));
  const closed = request.status === "completed";
  return steps.map((step, i) => {
    const entry = [...(request.statusTimeline ?? [])].reverse().find((e) => step.statuses.includes(e.status));
    const at = entry?.at ?? (i === 0 ? request.createdAt : null);
    const state = i < current || (closed && i === current) ? "done" : i === current ? "current" : "todo";
    return { key: step.key, label: step.label, at: state === "todo" ? null : at, state };
  });
}
