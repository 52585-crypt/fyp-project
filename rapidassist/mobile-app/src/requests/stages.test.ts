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
