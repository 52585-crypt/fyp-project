import { customerCanCancel, getCustomerStage, isActiveRequest, requestTimeline, type CustomerStage } from "./stages";
import type { RequestCategory, RequestStatus, ServiceRequest } from "./requests.types";

const allStatuses: RequestStatus[] = [
  "pending", "searching_provider", "provider_assigned", "provider_on_way", "provider_arrived", "in_progress",
  "waiting_user_approval", "vehicle_loaded", "reached_destination", "fuel_delivered", "inspection_started",
  "extra_work_requested", "work_started", "service_finished", "completed", "cancelled"
];

const expectedCustomer: Record<RequestStatus, CustomerStage> = {
  pending: "searching",
  searching_provider: "searching",
  provider_assigned: "assigned",
  provider_on_way: "tracking",
  provider_arrived: "arrived",
  in_progress: "in_progress",
  waiting_user_approval: "in_progress",
  vehicle_loaded: "vehicle_picked_up",
  reached_destination: "reached_destination",
  fuel_delivered: "fuel_delivered",
  inspection_started: "in_progress",
  extra_work_requested: "approve_extra_work",
  work_started: "in_progress",
  service_finished: "confirm_completion",
  completed: "completed",
  cancelled: "cancelled"
};

describe("getCustomerStage", () => {
  it.each(allStatuses)("maps %s", (status) => {
    expect(getCustomerStage({ status })).toBe(expectedCustomer[status]);
  });

  it("covers every backend status", () => {
    expect(Object.keys(expectedCustomer).sort()).toEqual([...allStatuses].sort());
  });

  it("shows no_provider when dispatch has run out of providers", () => {
    const dispatch = { state: "unavailable", offerId: null, offeredAt: null, expiresAt: null, deadline: null, attempts: 3, radiusKm: 10 } as const;
    expect(getCustomerStage({ status: "searching_provider", dispatch })).toBe("no_provider");
    expect(getCustomerStage({ status: "searching_provider", dispatch: { ...dispatch, state: "offered" } })).toBe("searching");
  });

  it("asks for approval on legacy waiting_user_approval only while extra work is pending", () => {
    const pending = { extraWork: { status: "pending" } } as ServiceRequest["mechanicDetails"];
    const decided = { extraWork: { status: "approved" } } as ServiceRequest["mechanicDetails"];
    expect(getCustomerStage({ status: "waiting_user_approval", mechanicDetails: pending })).toBe("approve_extra_work");
    expect(getCustomerStage({ status: "waiting_user_approval", mechanicDetails: decided })).toBe("in_progress");
  });
});

describe("helpers", () => {
  it("treats only completed and cancelled as inactive", () => {
    for (const status of allStatuses) {
      expect(isActiveRequest({ status })).toBe(status !== "completed" && status !== "cancelled");
    }
  });

  it("allows cancelling only before the provider arrives", () => {
    const cancellable = allStatuses.filter((status) => customerCanCancel(getCustomerStage({ status })));
    expect(cancellable).toEqual(["pending", "searching_provider", "provider_assigned", "provider_on_way"]);
  });
});

describe("requestTimeline", () => {
  const base = (category: RequestCategory, status: RequestStatus, statusTimeline: ServiceRequest["statusTimeline"] = []) =>
    requestTimeline({ category, status, statusTimeline, createdAt: "2026-01-01T10:00:00.000Z" });

  it("uses category specific steps", () => {
    expect(base("car_towing", "pending").map((i) => i.label)).toEqual([
      "Request Confirmed", "Driver Assigned", "Driver On The Way", "Driver Arrived", "Vehicle Picked Up", "Reached Destination", "Completed"
    ]);
    expect(base("fuel_delivery", "pending").map((i) => i.key)).toEqual(["confirmed", "assigned", "on_way", "arrived", "delivered", "completed"]);
    expect(base("mechanic", "pending").map((i) => i.key)).toEqual(["confirmed", "assigned", "on_way", "arrived", "inspection", "work", "completed"]);
  });

  it("marks done/current/todo and keeps server timestamps", () => {
    const items = base("car_towing", "provider_on_way", [
      { status: "provider_assigned", at: "2026-01-01T10:05:00.000Z" },
      { status: "provider_on_way", at: "2026-01-01T10:07:00.000Z" }
    ]);
    expect(items.map((i) => i.state)).toEqual(["done", "done", "current", "todo", "todo", "todo", "todo"]);
    expect(items[1]!.at).toBe("2026-01-01T10:05:00.000Z");
    expect(items[2]!.at).toBe("2026-01-01T10:07:00.000Z");
    expect(items[3]!.at).toBeNull();
  });

  it("marks everything done when completed", () => {
    expect(base("fuel_delivery", "completed").every((i) => i.state === "done")).toBe(true);
  });

  it("keeps extra work inside the inspection step", () => {
    const items = base("mechanic", "extra_work_requested");
    expect(items.find((i) => i.state === "current")!.key).toBe("inspection");
  });
});

import { getProviderStage, providerCanCancel, providerNextStatus, providerProgress, type ProviderStage } from "./stages";

const expectedProvider: Record<RequestStatus, ProviderStage> = {
  pending: "incoming",
  searching_provider: "incoming",
  provider_assigned: "job_details",
  provider_on_way: "on_the_way",
  provider_arrived: "arrived",
  in_progress: "in_progress",
  waiting_user_approval: "in_progress",
  vehicle_loaded: "in_progress",
  reached_destination: "payment_completion",
  fuel_delivered: "payment_completion",
  inspection_started: "inspection",
  extra_work_requested: "awaiting_approval",
  work_started: "in_progress",
  service_finished: "awaiting_customer",
  completed: "job_completed",
  cancelled: "cancelled"
};

describe("getProviderStage", () => {
  it.each(allStatuses)("maps %s", (status) => {
    expect(getProviderStage({ status })).toBe(expectedProvider[status]);
  });

  it("covers every backend status", () => {
    expect(Object.keys(expectedProvider).sort()).toEqual([...allStatuses].sort());
  });

  it("waits for the customer on legacy waiting_user_approval while extra work is pending", () => {
    const pending = { extraWork: { status: "pending" } } as ServiceRequest["mechanicDetails"];
    expect(getProviderStage({ status: "waiting_user_approval", mechanicDetails: pending })).toBe("awaiting_approval");
  });

  it("allows cancelling only before work starts", () => {
    const cancellable = allStatuses.filter((status) => providerCanCancel(getProviderStage({ status })));
    expect(cancellable).toEqual(["provider_assigned", "provider_on_way", "provider_arrived"]);
  });
});

describe("providerNextStatus mirrors the server transition table", () => {
  // server/src/controllers/requests.controller.js updateRequestStatus
  const server: Record<string, (category: RequestCategory) => RequestStatus[]> = {
    provider_assigned: () => ["provider_on_way"],
    provider_on_way: () => ["provider_arrived"],
    provider_arrived: (c) => [c === "car_towing" ? "vehicle_loaded" : c === "fuel_delivery" ? "fuel_delivered" : "inspection_started"],
    vehicle_loaded: () => ["reached_destination"],
    reached_destination: () => ["service_finished"],
    fuel_delivered: () => ["service_finished"],
    inspection_started: () => ["work_started"],
    work_started: () => ["service_finished"],
    in_progress: () => ["service_finished"]
  };
  const categories: RequestCategory[] = ["car_towing", "fuel_delivery", "mechanic"];

  it.each(allStatuses)("%s", (status) => {
    for (const category of categories) {
      const next = providerNextStatus({ status, category });
      const allowed = server[status]?.(category) ?? [];
      if (next === null) expect(allowed).toEqual([]);
      else expect(allowed).toContain(next);
    }
  });

  it("walks each category from assigned to service_finished", () => {
    const paths: Record<RequestCategory, RequestStatus[]> = {
      car_towing: ["provider_assigned", "provider_on_way", "provider_arrived", "vehicle_loaded", "reached_destination", "service_finished"],
      fuel_delivery: ["provider_assigned", "provider_on_way", "provider_arrived", "fuel_delivered", "service_finished"],
      mechanic: ["provider_assigned", "provider_on_way", "provider_arrived", "inspection_started", "work_started", "service_finished"]
    };
    for (const category of categories) {
      const path = paths[category];
      for (let i = 0; i < path.length - 1; i++) expect(providerNextStatus({ status: path[i]!, category })).toBe(path[i + 1]);
      expect(providerNextStatus({ status: "service_finished", category })).toBeNull();
    }
  });
});

describe("providerProgress", () => {
  it("tracks the mockup steps", () => {
    expect(providerProgress({ status: "provider_on_way", category: "mechanic" })).toEqual({ steps: ["Accepted", "On The Way", "Arrived", "Completed"], current: 1 });
    expect(providerProgress({ status: "vehicle_loaded", category: "car_towing" }).current).toBe(3);
    expect(providerProgress({ status: "completed", category: "fuel_delivery" }).current).toBe(3);
  });
});
