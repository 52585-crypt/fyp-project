import { api } from "../config/api";
import type { AuthResponse, GoogleMechanicProfile, MechanicProfile, SafeUser, UserRole } from "./auth.types";

export async function register(params: {
  name: string;
  phone: string;
  isCertified?: boolean;
  certificateUrl?: string;
  mechanicProfile?: Omit<MechanicProfile, "identityMatch" | "selfieUrl" | "idCardFrontUrl" | "idCardBackUrl">;
} & (
  { role: UserRole; password: string; googleIdToken?: never }
  | { role: "mechanic"; googleIdToken: string; password?: never }
)) {
  const res = await api.post<AuthResponse>("/api/auth/register", params, { timeout: 60000 });
  return res.data;
}

export async function login(params: { phone: string; password: string }) {
  const res = await api.post<AuthResponse>("/api/auth/login", params);
  return res.data;
}

export type GoogleIntent = "customer" | "mechanic_register" | "mechanic_login";
type GoogleRegistrationRequired = { ok: true; registrationRequired: true; profile: GoogleMechanicProfile; enrollmentTicket?: string };

export async function loginWithGoogle(idToken: string, intent: GoogleIntent = "customer") {
  const res = await api.post<AuthResponse | GoogleRegistrationRequired>("/api/auth/google", { idToken, intent });
  return res.data;
}

export async function linkGoogleAccount(token: string, idToken: string, password: string) {
  const { data } = await api.post<GoogleRegistrationRequired>("/api/auth/me/google-link", { idToken, password }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
}

export const providerOnboardingRoute = { pathname: "/(provider)/verification", params: { onboarding: "1" } } as const;

export function authDestination(user: SafeUser, duringRegistration = false) {
  if ((user.activeRole ?? user.role) === "mechanic") return duringRegistration ? providerOnboardingRoute : "/(provider)/dashboard";
  return user.phone ? "/(user)/home" : "/(auth)/complete-profile";
}

export async function enrollProvider(params: {
  enrollmentTicket: string;
  phone: string;
  mechanicProfile: Omit<MechanicProfile, "identityMatch" | "selfieUrl" | "idCardFrontUrl" | "idCardBackUrl">;
}) {
  const { data } = await api.post<AuthResponse>("/api/auth/provider-enrollment", params, { timeout: 60000 });
  return data;
}

export async function changeActiveRole(token: string, activeRole: UserRole) {
  const { data } = await api.patch<AuthResponse>("/api/auth/me/active-role", { activeRole }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
}

export async function recoverProviderRegistration(credentials: { googleIdToken: string } | { phone: string; password: string }) {
  try {
    const session = "googleIdToken" in credentials
      ? await loginWithGoogle(credentials.googleIdToken, "mechanic_login")
      : await login(credentials);
    if ("registrationRequired" in session) return null;
    if (session.user.role === "mechanic") return session;
    if (session.user.roles?.includes("mechanic")) return await changeActiveRole(session.token, "mechanic");
    return null;
  } catch {
    return null;
  }
}

export async function completeGooglePhone(token: string, phone: string) {
  const res = await api.patch<{ ok: boolean; user: AuthResponse["user"] }>(
    "/api/auth/me/phone",
    { phone },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

export async function me(token: string) {
  const res = await api.get<{ ok: boolean; user: any }>("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
}

