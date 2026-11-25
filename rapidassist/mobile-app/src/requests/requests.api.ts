import { api } from "../config/api";
import type { ChatMessage, CreateRequestInput, ExtraWorkInput, NearbyProvider, ProviderEarnings, RequestCategory, RequestLocation, ServiceRequest } from "./requests.types";

export async function createRequest(token: string, input: CreateRequestInput) {
  const res = await api.post<{ ok: boolean; request: ServiceRequest }>("/api/requests", input, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data.request;
}

export async function listMyRequests(token: string) {
  const res = await api.get<{ ok: boolean; requests: ServiceRequest[] }>("/api/requests", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data.requests;
}

export async function listOpenRequests(token: string) {
  const res = await api.get<{ ok: boolean; requests: ServiceRequest[] }>("/api/requests/open", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data.requests;
}

export async function listNearbyProviders(
  token: string,
  input: { category: RequestCategory; lat: number; lng: number }
) {
  // radiusKm = radius actually searched; when nobody is inside dispatchRadiusKm the server widens the search
  // (expanded: true) so the map still shows the nearest providers, outside the auto-dispatch range.
  const res = await api.get<{ ok: boolean; radiusKm: number; dispatchRadiusKm?: number; expanded?: boolean; providers: NearbyProvider[] }>(
    "/api/requests/nearby-providers",
    {
      params: input,
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  return res.data;
}

export async function getRequest(token: string, id: string) {
  const res = await api.get<{ ok: boolean; request: ServiceRequest }>(`/api/requests/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data.request;
}

export async function refreshRequestLocation(token: string, id: string, field: "pickup" | "destination") {
  const res = await api.post<{ ok: boolean; request: ServiceRequest }>(`/api/requests/${encodeURIComponent(id)}/location/${field}/refresh`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data.request;
}

export async function acceptRequest(token: string, id: string, offerId?: string | null) {
  const res = await api.patch<{ ok: boolean; request: ServiceRequest }>(
    `/api/requests/${id}/accept`,
    { offerId },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.request;
}

export async function getDispatchOffers(token: string) {
  const res = await api.get<{ requests: ServiceRequest[]; serverTime: string }>("/api/requests/open", { headers: { Authorization: `Bearer ${token}` } });
  return res.data;
}

export async function declineRequest(token: string, id: string, offerId: string) {
  await api.patch(`/api/requests/${id}/decline`, { offerId }, { headers: { Authorization: `Bearer ${token}` } });
}

export async function retryDispatch(token: string, id: string) {
  const res = await api.post<{ request: ServiceRequest }>(`/api/requests/${id}/dispatch/retry`, {}, { headers: { Authorization: `Bearer ${token}` } });
  return res.data.request;
}

export async function updateRequestStatus(token: string, id: string, status: ServiceRequest["status"], note?: string) {
  const res = await api.patch<{ ok: boolean; request: ServiceRequest }>(
    `/api/requests/${id}/status`,
    { status, note },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.request;
}

export async function submitRequestReview(token: string, id: string, rating: number, comment?: string) {
  const res = await api.patch<{ ok: boolean; request: ServiceRequest }>(
    `/api/requests/${id}/review`,
    { rating, comment },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.request;
}

/** Adds the device clock at send time, so the server can measure the fix's age on one clock (no clock-skew drift). */
const withSentAt = (location: RequestLocation) => ({ ...location, sentAt: new Date().toISOString() });

export async function updateProviderAvailability(token: string, isOnline: boolean, location?: RequestLocation | null) {
  const res = await api.patch(
    "/api/requests/provider/availability",
    { isOnline, location: location ? withSentAt(location) : location },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.provider;
}

export async function updateProviderLocation(token: string, location: RequestLocation) {
  const res = await api.patch(
    "/api/requests/provider/location",
    { location: withSentAt(location) },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.provider;
}

export async function getProviderActiveRequest(token: string) {
  const res = await api.get<{ ok: boolean; request: ServiceRequest | null }>("/api/requests/provider/active", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data.request;
}

export async function getProviderHistory(token: string) {
  const res = await api.get<{ ok: boolean; requests: ServiceRequest[] }>("/api/requests/provider/history", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data.requests;
}

export async function getProviderEarnings(token: string) {
  const res = await api.get<{ ok: boolean; earnings: ProviderEarnings }>("/api/requests/provider/earnings", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data.earnings;
}

export async function requestExtraWork(token: string, id: string, input: ExtraWorkInput) {
  const res = await api.patch<{ ok: boolean; request: ServiceRequest }>(
    `/api/requests/${id}/extra-work`,
    input,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.request;
}

export async function approveExtraWork(token: string, id: string, approved = true) {
  const res = await api.patch<{ ok: boolean; request: ServiceRequest }>(
    `/api/requests/${id}/extra-work/approve`,
    { approved },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.request;
}

export async function getRequestMessages(token: string, id: string) {
  const res = await api.get<{ ok: boolean; messages: ChatMessage[] }>(
    `/api/requests/${id}/messages`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.messages;
}

export async function sendRequestMessage(token: string, id: string, body: string, clientMessageId: string) {
  const res = await api.post<{ ok: boolean; message: ChatMessage }>(
    `/api/requests/${id}/messages`,
    { body, clientMessageId },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.message;
}
