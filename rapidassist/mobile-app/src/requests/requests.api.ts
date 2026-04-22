import { api } from "../config/api";
import type { CreateRequestInput, ServiceRequest } from "./requests.types";

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

