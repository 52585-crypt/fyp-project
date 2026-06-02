import { api } from "../config/api";
import type { AuthResponse, MechanicProfile, UserRole } from "./auth.types";

export async function register(params: {
  role: UserRole;
  name: string;
  phone: string;
  password: string;
  isCertified?: boolean;
  certificateUrl?: string;
  mechanicProfile?: Omit<MechanicProfile, "identityMatch">;
}) {
  const res = await api.post<AuthResponse>("/api/auth/register", params);
  return res.data;
}

export async function login(params: { phone: string; password: string }) {
  const res = await api.post<AuthResponse>("/api/auth/login", params);
  return res.data;
}

export async function me(token: string) {
  const res = await api.get<{ ok: boolean; user: any }>("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
}

