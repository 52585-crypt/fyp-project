import type { Href } from "expo-router";
import type { RequestCategory } from "../requests/requests.types";

/** Single place that knows screen URLs. Screens build links with these instead of string literals. */
export const customerRoutes = {
  home: "/home" as Href,
  requests: "/requests" as Href,
  payments: { pathname: "/requests", params: { view: "payments" } } as Href,
  support: "/support" as Href,
  account: "/account" as Href,
  notifications: "/notifications" as Href,
  vehicles: "/vehicles" as Href,
  addVehicle: "/vehicles/add" as Href,
  newRequest: (service: RequestCategory) => ({ pathname: "/request/new/[service]", params: { service } }) as Href,
  /** Problem & fare step (route name kept for existing links). */
  estimate: "/request/estimate" as Href,
  request: (id: string) => ({ pathname: "/request/[id]", params: { id } }) as Href,
  chat: (id: string) => ({ pathname: "/request/[id]/chat", params: { id } }) as Href,
  pay: (id: string) => ({ pathname: "/request/[id]/pay", params: { id } }) as Href,
  review: (id: string) => ({ pathname: "/request/[id]/review", params: { id } }) as Href
};

export const providerRoutes = {
  dashboard: "/dashboard" as Href,
  jobs: "/jobs" as Href,
  earnings: "/earnings" as Href,
  inbox: "/inbox" as Href,
  profile: "/profile" as Href,
  verification: "/verification" as Href,
  incoming: (id: string) => ({ pathname: "/incoming/[id]", params: { id } }) as Href,
  job: (id: string) => ({ pathname: "/job/[id]", params: { id } }) as Href,
  chat: (id: string) => ({ pathname: "/job/[id]/chat", params: { id } }) as Href,
  extraWork: (id: string) => ({ pathname: "/job/[id]/extra-work", params: { id } }) as Href,
  payment: (id: string) => ({ pathname: "/job/[id]/payment", params: { id } }) as Href
};
