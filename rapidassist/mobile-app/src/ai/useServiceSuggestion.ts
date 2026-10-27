import { useCallback, useEffect, useRef, useState } from "react";
import { requestServiceSuggestion } from "./serviceSuggestion.api";
import type {
  ServiceSuggestion,
  ServiceSuggestionClarification,
  ServiceSuggestionStatus
} from "./serviceSuggestion.types";

export const MAX_SERVICE_CLARIFICATIONS = 3;

export function getSuggestionOutcome(
  suggestion: ServiceSuggestion,
  clarificationCount: number
): "clarification" | "suggested" | "unsupported" {
  if (suggestion.needsClarification) {
    return clarificationCount >= MAX_SERVICE_CLARIFICATIONS ? "unsupported" : "clarification";
  }
  return suggestion.recommendedService ? "suggested" : "unsupported";
}

function wasCanceled(error: any) {
  return error?.code === "ERR_CANCELED" || error?.name === "CanceledError" || error?.name === "AbortError";
}

type Options = {
  token: string | null;
  description: string;
  manualSelectionVersion?: number;
  onSuggestionAccepted?: (suggestion: ServiceSuggestion) => void;
};

export function useServiceSuggestion({
  token,
  description,
  manualSelectionVersion = 0,
  onSuggestionAccepted
}: Options) {
  const [status, setStatus] = useState<ServiceSuggestionStatus>("idle");
  const [suggestion, setSuggestion] = useState<ServiceSuggestion | null>(null);
  const [clarifications, setClarifications] = useState<ServiceSuggestionClarification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const activeController = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const previousDescription = useRef(description);
  const previousManualVersion = useRef(manualSelectionVersion);

  const cancelPending = useCallback(() => {
    requestSequence.current += 1;
    activeController.current?.abort();
    activeController.current = null;
  }, []);

  const reset = useCallback(() => {
    cancelPending();
    setStatus("idle");
    setSuggestion(null);
    setClarifications([]);
    setError(null);
    setErrorStatus(null);
    setRetryAfterSeconds(0);
  }, [cancelPending]);

  useEffect(() => {
    if (previousDescription.current === description) return;
    previousDescription.current = description;
    reset();
  }, [description, reset]);

  useEffect(() => {
    if (previousManualVersion.current === manualSelectionVersion) return;
    previousManualVersion.current = manualSelectionVersion;
    reset();
  }, [manualSelectionVersion, reset]);

  useEffect(() => () => cancelPending(), [cancelPending]);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = setTimeout(() => {
      setRetryAfterSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [retryAfterSeconds]);

  const runSuggestion = useCallback(async (nextClarifications: ServiceSuggestionClarification[]) => {
    const normalizedDescription = description.trim();
    if (normalizedDescription.length < 5) {
      setStatus("error");
      setError("Describe the vehicle problem using at least 5 characters.");
      setErrorStatus(400);
      return;
    }
    if (!token) {
      setStatus("error");
      setError("Please sign in to request an AI suggestion.");
      setErrorStatus(401);
      return;
    }

    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    const requestId = ++requestSequence.current;
    setStatus("loading");
    setSuggestion(null);
    setError(null);
    setErrorStatus(null);
    setRetryAfterSeconds(0);

    try {
      const nextSuggestion = await requestServiceSuggestion(token, {
        description: normalizedDescription,
        clarifications: nextClarifications
      }, controller.signal);
      if (controller.signal.aborted || requestId !== requestSequence.current) return;

      const outcome = getSuggestionOutcome(nextSuggestion, nextClarifications.length);
      setSuggestion(
        outcome === "unsupported" && nextSuggestion.needsClarification
          ? {
              ...nextSuggestion,
              possibleIssue: "I still need more detail to choose a service safely. Please choose a service manually.",
              followUpQuestion: null,
              needsClarification: false
            }
          : nextSuggestion
      );
      setStatus(outcome);
    } catch (requestError: any) {
      if (wasCanceled(requestError) || requestId !== requestSequence.current) return;
      setStatus("error");
      setError(requestError?.message || "Unable to get a suggestion. Please try again.");
      setErrorStatus(Number(requestError?.status) || null);
      setRetryAfterSeconds(
        Number.isFinite(requestError?.retryAfterSeconds)
          ? Math.min(3600, Math.max(0, Math.ceil(requestError.retryAfterSeconds)))
          : 0
      );
    } finally {
      if (requestId === requestSequence.current) activeController.current = null;
    }
  }, [description, token]);

  const suggest = useCallback(() => {
    setClarifications([]);
    void runSuggestion([]);
  }, [runSuggestion]);

  const answerClarification = useCallback((answer: string) => {
    const normalizedAnswer = answer.trim();
    const question = suggestion?.followUpQuestion;
    if (!question || !normalizedAnswer) {
      setError("Please answer the question before continuing.");
      return;
    }
    const nextClarifications = [...clarifications, { question, answer: normalizedAnswer }];
    setClarifications(nextClarifications);
    void runSuggestion(nextClarifications);
  }, [clarifications, runSuggestion, suggestion]);

  const retry = useCallback(() => {
    if (retryAfterSeconds > 0) return;
    void runSuggestion(clarifications);
  }, [clarifications, retryAfterSeconds, runSuggestion]);

  const acceptSuggestion = useCallback(() => {
    if (!suggestion?.recommendedService) return;
    setStatus("applied");
    onSuggestionAccepted?.(suggestion);
  }, [onSuggestionAccepted, suggestion]);

  return {
    status,
    suggestion,
    clarifications,
    error,
    errorStatus,
    retryAfterSeconds,
    suggest,
    answerClarification,
    retry,
    acceptSuggestion,
    chooseManually: reset,
    cancel: cancelPending
  };
}
