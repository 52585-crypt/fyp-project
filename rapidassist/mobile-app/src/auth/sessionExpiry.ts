export function isExpiredCustomerSession(
  error: { response?: { status?: number }; config?: { headers?: { get?: (name: string) => unknown; Authorization?: unknown; authorization?: unknown } } },
  session: { token: string; role: string } | null
) {
  if (session?.role !== "user" || error?.response?.status !== 401) return false;
  const headers = error.config?.headers;
  const authorization = headers?.get?.("Authorization") ?? headers?.Authorization ?? headers?.authorization;
  return authorization === `Bearer ${session.token}`;
}
