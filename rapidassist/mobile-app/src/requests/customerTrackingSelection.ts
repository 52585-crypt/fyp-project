import type { ServiceRequest } from "./requests.types";

export function isActiveCustomerRequest(request: ServiceRequest) {
  return request.status !== "completed" && request.status !== "cancelled";
}

export function verifiedCustomerRequest(request: ServiceRequest | null, requestId: string, customerId: string) {
  return request?.id === requestId && request.userId === customerId ? request : null;
}

export function selectActiveCustomerRequest(requests: ServiceRequest[], customerId: string) {
  return requests.find((request) => request.userId === customerId && isActiveCustomerRequest(request)) ?? null;
}
