import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { providerRoutes } from "../../navigation/routes";
import { useVerification } from "../../verification/VerificationProvider";
import { canAcceptServiceRequests } from "../../verification/verification";
import { useDispatchUpdates, useOfferSeconds } from "../DispatchProvider";
import { acceptRequest, declineRequest, getRequest } from "../requests.api";
import type { ServiceRequest } from "../requests.types";

const message = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

/** One dispatch offer: countdown, accept (→ job screen), decline (→ dashboard). Single-flight. */
export function useIncomingOffer(requestId: string | null, initial?: ServiceRequest | null) {
  const { token } = useAuth();
  const { refresh, revision } = useDispatchUpdates();
  const verification = useVerification();
  const canAccept = !verification.loading && !verification.error && canAcceptServiceRequests(verification.status);
  const [request, setRequest] = useState<ServiceRequest | null>(initial ?? null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seconds = useOfferSeconds(request?.dispatch?.expiresAt);

  const load = useCallback(async () => {
    if (!token || !requestId) return;
    try { setRequest(await getRequest(token, requestId)); setError(null); } catch (e) { setError(message(e, "Failed to load request details")); }
  }, [requestId, token]);
  useEffect(() => { if (!initial) void load(); }, [load, revision, initial]);

  async function accept() {
    if (!token || !request || !canAccept || busy) return;
    setBusy("accept");
    setError(null);
    try {
      const accepted = await acceptRequest(token, request.id, request.dispatch?.offerId);
      await refresh();
      router.replace(providerRoutes.job(accepted.id));
    } catch (e) { setError(message(e, "Failed to accept request")); } finally { setBusy(null); }
  }

  async function decline() {
    if (!token || !request?.dispatch?.offerId || busy) return;
    setBusy("decline");
    setError(null);
    try {
      await declineRequest(token, request.id, request.dispatch.offerId);
      await refresh();
      if (requestId) router.replace(providerRoutes.dashboard);
    } catch (e) { setError(message(e, "Unable to decline offer.")); } finally { setBusy(null); }
  }

  const expired = Boolean(request?.dispatch?.expiresAt) && seconds === 0;
  return { request, seconds, expired, canAccept, busy, error, accept, decline, reload: load,
    alreadyAssigned: Boolean(request?.providerId) };
}
