const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MESSAGE = "Too many location searches. Please wait and try again.";
const PRUNE_AT = 5_000;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

/**
 * Fixed-window, per-user rate limit (in memory, per server process). Over the limit it answers 429 with
 * `message` and a Retry-After header in seconds. Options: limit (else process.env[envVar], else defaultLimit),
 * windowMs, message, envVar (default PLACES_RATE_LIMIT_PER_MINUTE), defaultLimit, now (tests).
 */
function createLocationRateLimit(options = {}) {
  const envVar = options.envVar || "PLACES_RATE_LIMIT_PER_MINUTE";
  const limit = positiveInteger(options.limit ?? process.env[envVar], positiveInteger(options.defaultLimit, DEFAULT_LIMIT));
  const windowMs = positiveInteger(options.windowMs, DEFAULT_WINDOW_MS);
  const message = options.message || DEFAULT_MESSAGE;
  const now = typeof options.now === "function" ? options.now : Date.now;
  const buckets = new Map();

  return function locationRateLimit(req, res, next) {
    const userId = req.user?._id ? String(req.user._id) : null;
    if (!userId) return next(Object.assign(new Error("Unauthorized"), { statusCode: 401 }));
    const currentTime = now();
    // Expired windows are dropped once the map grows, so memory stays bounded by recently active users.
    if (buckets.size > PRUNE_AT) for (const [key, b] of buckets) if (b.resetAt <= currentTime) buckets.delete(key);
    const existing = buckets.get(userId);
    const bucket = !existing || existing.resetAt <= currentTime
      ? { count: 0, resetAt: currentTime + windowMs }
      : existing;
    if (bucket.count >= limit) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000))));
      return next(Object.assign(new Error(message), { statusCode: 429 }));
    }
    bucket.count += 1;
    buckets.set(userId, bucket);
    next();
  };
}

module.exports = { createLocationRateLimit };
