const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 60_000;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function createAiRateLimit(options = {}) {
  const limit = positiveInteger(options.limit ?? process.env.AI_RATE_LIMIT_PER_MINUTE, DEFAULT_LIMIT);
  const windowMs = positiveInteger(options.windowMs, DEFAULT_WINDOW_MS);
  const now = typeof options.now === "function" ? options.now : Date.now;
  const buckets = new Map();

  return function aiRateLimit(req, res, next) {
    const userId = req.user?._id ? String(req.user._id) : null;
    if (!userId) return next(Object.assign(new Error("Unauthorized"), { statusCode: 401 }));

    const currentTime = now();
    const existing = buckets.get(userId);
    const bucket = !existing || existing.resetAt <= currentTime
      ? { count: 0, resetAt: currentTime + windowMs }
      : existing;

    if (bucket.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000));
      res.set("Retry-After", String(retryAfterSeconds));
      return next(Object.assign(new Error("Too many AI suggestion requests. Please wait and try again."), {
        statusCode: 429
      }));
    }

    bucket.count += 1;
    buckets.set(userId, bucket);
    return next();
  };
}

module.exports = { createAiRateLimit };
