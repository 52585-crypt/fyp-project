import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getMechanicVerification, submitMechanicVerification } from "./verification.api";
import type { VerificationDraft } from "./verification.api";
import { canSubmitVerification, shouldCheckSubmissionStatus } from "./verification";
import type { VerificationStatus } from "./verification";

type VerificationContextValue = {
  status: VerificationStatus | null;
  loading: boolean;
  error: string | null;
  submitting: boolean;
  refresh: () => Promise<void>;
  submit: (draft: VerificationDraft) => Promise<boolean>;
};

const VerificationContext = createContext<VerificationContextValue | null>(null);

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function VerificationProvider({ token, children }: { token: string | null; children: React.ReactNode }) {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pendingCheck = useRef<Promise<VerificationStatus | null> | null>(null);
  const submissionInProgress = useRef(false);

  const check = useCallback(() => {
    if (pendingCheck.current) return pendingCheck.current;
    if (!token) return Promise.resolve(null);
    setLoading(true);
    setError(null);
    const request = getMechanicVerification(token).then((verification) => {
      setStatus(verification);
      return verification;
    }).catch((failure: unknown) => {
      setError(errorMessage(failure, "Unable to load verification status. Try again."));
      return null;
    }).finally(() => {
      pendingCheck.current = null;
      setLoading(false);
    });
    pendingCheck.current = request;
    return request;
  }, [token]);

  const refresh = useCallback(async () => {
    if (!submissionInProgress.current) await check();
  }, [check]);

  async function submit(draft: VerificationDraft) {
    if (submissionInProgress.current) return false;
    if (!token || !status || error || !canSubmitVerification(status)) throw new Error("Check your verification status before submitting.");
    submissionInProgress.current = true;
    setSubmitting(true);
    try {
      const current = pendingCheck.current ? await pendingCheck.current : status;
      if (!current) throw new Error("Check your verification status before submitting.");
      if (!canSubmitVerification(current)) throw new Error("Your verification status changed. Check the latest status.");
      try {
        setStatus(await submitMechanicVerification(token, draft));
        return true;
      } catch (failure) {
        if (shouldCheckSubmissionStatus(failure)) {
          const updated = await check();
          if (updated?.submissionId && updated.submissionId !== current.submissionId) return true;
        }
        throw failure;
      }
    } finally {
      submissionInProgress.current = false;
      setSubmitting(false);
    }
  }

  return (
    <VerificationContext.Provider value={{ status, loading, error, submitting, refresh, submit }}>
      {children}
    </VerificationContext.Provider>
  );
}

export function useVerification() {
  const verification = useContext(VerificationContext);
  if (!verification) throw new Error("VerificationProvider is required.");
  const { refresh } = verification;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return verification;
}
