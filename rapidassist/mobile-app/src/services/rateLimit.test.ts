import { DEFAULT_RATE_LIMIT_WAIT_MS, rateLimitWait } from "./rateLimit";

const limited = (headers: Record<string, unknown>, message?: unknown) => ({ response: { status: 429, headers, data: { message } } });

describe("rate limit wait", () => {
  it("waits for Retry-After seconds and keeps the server's message", () => {
    expect(rateLimitWait(limited({ "retry-after": "42" }, "Too many nearby-provider requests."))).toEqual({
      waitMs: 42_000, message: "Too many nearby-provider requests."
    });
  });

  it("falls back to a minute and a generic message, and caps absurd waits", () => {
    expect(rateLimitWait(limited({}))).toEqual({ waitMs: DEFAULT_RATE_LIMIT_WAIT_MS, message: "Too many requests. Please wait a moment." });
    expect(rateLimitWait(limited({ "retry-after": "abc" }))?.waitMs).toBe(DEFAULT_RATE_LIMIT_WAIT_MS);
    expect(rateLimitWait(limited({ "retry-after": "99999" }))?.waitMs).toBe(600_000);
  });

  it("ignores anything that is not a 429", () => {
    expect(rateLimitWait({ response: { status: 500 } })).toBeNull();
    expect(rateLimitWait(new Error("offline"))).toBeNull();
    expect(rateLimitWait(null)).toBeNull();
  });
});
