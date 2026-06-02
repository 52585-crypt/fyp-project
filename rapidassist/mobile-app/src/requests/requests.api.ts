import { api } from "../config/api";
import type { CreateRequestInput, ExtraWorkInput, ProviderEarnings, RequestLocation, ServiceRequest } from "./requests.types";

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

export async function acceptRequest(token: string, id: string) {
  const res = await api.patch<{ ok: boolean; request: ServiceRequest }>(
    `/api/requests/${id}/accept`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
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

export async function updateProviderAvailability(token: string, isOnline: boolean, location?: RequestLocation | null) {
  const res = await api.patch(
    "/api/requests/provider/availability",
    { isOnline, location },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.provider;
}

export async function updateProviderLocation(token: string, location: RequestLocation) {
  const res = await api.patch(
    "/api/requests/provider/location",
    { location },
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

