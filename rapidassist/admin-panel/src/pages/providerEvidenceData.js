import { useEffect, useState } from "react";
import { adminApi } from "../config/api";

const EVIDENCE_LABELS = {
  profile: "Selfie (straight)",
  profileLeft: "Selfie (head turned left)",
  profileRight: "Selfie (head turned right)",
  cnic: "CNIC front"
};

const EMPTY = { error: "", provider: null, verification: null, images: [] };

/**
 * Loads one provider's detail only when it is selected: the stored photos (the list carries none) and the private
 * verification evidence, fetched image by image through the authenticated, no-store admin endpoint.
 * `version` (e.g. the verification status) reloads it after a decision.
 */
export function useProviderEvidence(providerId, version) {
  const key = providerId ? `${providerId}:${version ?? ""}` : "";
  const [state, setState] = useState({ key: "", ...EMPTY });

  useEffect(() => {
    if (!key) return undefined;
    const controller = new AbortController();
    const objectUrls = [];

    (async () => {
      const [detail, review] = await Promise.all([
        adminApi.get("/api/admin/providers", { params: { status: "all", id: providerId }, signal: controller.signal }),
        adminApi.get(`/api/admin/providers/${providerId}/verification`, { signal: controller.signal })
      ]);
      const verification = review.data.verification;
      const images = [];
      for (const kind of verification?.images || []) {
        const blob = await adminApi.get(`/api/admin/providers/${providerId}/verification/images/${kind}`, {
          params: { submissionId: verification.submissionId }, responseType: "blob", signal: controller.signal
        });
        const url = URL.createObjectURL(blob.data);
        objectUrls.push(url);
        images.push({ kind, label: EVIDENCE_LABELS[kind] || kind, url });
      }
      if (!controller.signal.aborted) {
        setState({ key, error: "", provider: detail.data.providers?.[0] || null, verification, images });
      }
    })().catch((err) => {
      if (!controller.signal.aborted) {
        setState({ key, ...EMPTY, error: err?.response?.data?.message || err?.message || "Failed to load provider details" });
      }
    });

    return () => {
      controller.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [key, providerId]);

  // Until the selected provider's data arrives, show it as loading instead of the previous provider's evidence.
  return state.key === key ? { ...state, loading: false } : { ...EMPTY, loading: Boolean(key) };
}

export function faceCheckSummary(faceChecks) {
  if (!faceChecks) {
    return { tone: "muted", title: "Not run", text: "No verification selfies have been submitted yet." };
  }
  if (faceChecks.status === "error") {
    return { tone: "warning", title: "Check failed", text: `The face models could not run (${faceChecks.error || "unknown error"}). Review the selfies manually.` };
  }
  if (faceChecks.status === "flagged") {
    const dup = faceChecks.duplicate || {};
    return {
      tone: "danger",
      title: "Possible duplicate account",
      text: `This face closely matches ${dup.matchedName || "another provider"}${dup.matchedPhone ? ` (${dup.matchedPhone})` : ""}, distance ${dup.distance ?? "?"}. Check that this is not the same person registering twice.`
    };
  }
  return { tone: "success", title: "Passed", text: "Head-turn liveness passed and no other provider has the same face." };
}

