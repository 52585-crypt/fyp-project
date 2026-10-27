import { api } from "../config/api";
import type { ServiceSuggestion, ServiceSuggestionRequest, ServiceSuggestionResponse } from "./serviceSuggestion.types";

export const SERVICE_SUGGESTION_TIMEOUT_MS = 20_000;

export class ServiceSuggestionApiError extends Error {
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;

  constructor(message: string, status: number | null = null, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "ServiceSuggestionApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function retryAfterSeconds(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

export function serviceSuggestionErrorFrom(error: any) {
  const status = Number(error?.response?.status) || null;
  const serverMessage = error?.response?.data?.message;
  const retryAfter = retryAfterSeconds(error?.response?.headers?.["retry-after"]);

  if (status === 400) {
    return new ServiceSuggestionApiError(
      typeof serverMessage === "string" ? serverMessage : "Please enter a clearer problem description.",
      status
    );
  }
  if (status === 401) return new ServiceSuggestionApiError("Your session has expired. Please sign in again.", status);
  if (status === 403) return new ServiceSuggestionApiError("AI service suggestions are available to customer accounts.", status);
  if (status === 429) {
    const waitText = retryAfter ? ` Wait ${retryAfter} seconds before retrying.` : " Please wait before retrying.";
    return new ServiceSuggestionApiError(`Too many suggestion requests.${waitText}`, status, retryAfter);
  }
  if (status === 502) return new ServiceSuggestionApiError("The AI returned an invalid suggestion. Retry or choose a service manually.", status);
  if (status === 503) return new ServiceSuggestionApiError("AI suggestions are temporarily unavailable. Choose a service manually or retry later.", status);
  if (status === 504 || error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") {
    return new ServiceSuggestionApiError("The suggestion timed out. Retry or choose a service manually.", status || 504);
  }
  if (error?.code === "ERR_NETWORK" || error?.message === "Network Error") {
    return new ServiceSuggestionApiError("Unable to connect. Check your internet connection and try again.", status);
  }
  return new ServiceSuggestionApiError(
    typeof error?.message === "string" && error.message ? error.message : "Unable to get a suggestion. Please try again.",
    status
  );
}

export async function requestServiceSuggestion(
  token: string,
  input: ServiceSuggestionRequest,
  signal?: AbortSignal
): Promise<ServiceSuggestion> {
  try {
    const response = await api.post<ServiceSuggestionResponse>("/api/ai/service-suggestion", input, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
      timeout: SERVICE_SUGGESTION_TIMEOUT_MS
    });
    return response.data.suggestion;
  } catch (error: any) {
    if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError" || error?.name === "AbortError") throw error;
    throw serviceSuggestionErrorFrom(error);
  }
}

