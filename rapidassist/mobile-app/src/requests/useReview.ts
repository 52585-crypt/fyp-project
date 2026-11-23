import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { submitRequestReview } from "./requests.api";
import type { ServiceRequest } from "./requests.types";

export const REVIEW_MAX = 400;

/** 1–5 star review with optional comment (server limit 400 chars). Single-flight submit. */
export function useReview(request: ServiceRequest | null, onSubmitted: (r: ServiceRequest) => void) {
  const { token } = useAuth();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token || !request || submitting) return;
    setSubmitting(true);
    setError(null);
    try { onSubmitted(await submitRequestReview(token, request.id, rating, comment.trim())); }
    catch (e: any) { setError(e?.response?.data?.message || e?.message || "Failed to submit review"); }
    finally { setSubmitting(false); }
  }

  return { rating, setRating, comment, setComment, submitting, error, submit };
}
