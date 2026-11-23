export function trackingLoadFailure(error: unknown, explicit: boolean) {
  const failure = error as { response?: { status?: number; data?: { message?: unknown } }; message?: unknown } | null;
  if (explicit && [401, 403, 404].includes(failure?.response?.status ?? 0)) {
    return { kind: "unavailable", message: "This request is unavailable." } as const;
  }
  const message = failure?.response?.data?.message ?? failure?.message;
  return { kind: "failed", message: typeof message === "string" && message ? message : "Failed to load tracking." } as const;
}

export function trackingEmptyTitle(state: "loading" | "empty" | "failed" | "unavailable") {
  if (state === "loading") return "Loading request…";
  if (state === "failed") return "Couldn’t load tracking";
  if (state === "unavailable") return "Request unavailable";
  return "No request to track";
}
