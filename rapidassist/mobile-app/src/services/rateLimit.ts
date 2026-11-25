/** Wait used when a 429 carries no usable Retry-After. */
export const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000;
const MAX_WAIT_MS = 10 * 60_000;

export type RateLimitWait = { waitMs: number; message: string };

/**
 * For a 429 from the API: how long to stay quiet (from Retry-After, in seconds) and the server's message.
 * Null for any other error, so callers keep their normal error handling.
 */
export function rateLimitWait(error: unknown): RateLimitWait | null {
  const response = (error as { response?: { status?: number; headers?: Record<string, unknown>; data?: { message?: unknown } } } | null)?.response;
  if (response?.status !== 429) return null;
  const header = response.headers?.["retry-after"] ?? response.headers?.["Retry-After"];
  const seconds = Number(header);
  const waitMs = Number.isFinite(seconds) && seconds > 0 ? Math.min(MAX_WAIT_MS, seconds * 1000) : DEFAULT_RATE_LIMIT_WAIT_MS;
  const message = typeof response.data?.message === "string" && response.data.message
    ? response.data.message : "Too many requests. Please wait a moment.";
  return { waitMs, message };
}
