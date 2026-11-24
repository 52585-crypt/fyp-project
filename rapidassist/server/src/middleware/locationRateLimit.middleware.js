const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_MS = 60_000;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function createLocationRateLimit(options = {}) {
  const limit = positiveInteger(options.limit ?? process.env.PLACES_RATE_LIMIT_PER_MINUTE, DEFAULT_LIMIT);
  const windowMs = positiveInteger(options.windowMs, DEFAULT_WINDOW_MS);
  const now = typeof options.now === "function" ? options.now : Date.now;
  const buckets = new Map();

  return function locationRateLimit(req, res, next) {
    const userId = req.user?._id ? String(req.user._id) : null;
    if (!userId) return next(Object.assign(new Error("Unauthorized"), { statusCode: 401 }));
    const currentTime = now();
    const existing = buckets.get(userId);
    const bucket = !existing || existing.resetAt <= currentTime
      ? { count: 0, resetAt: currentTime + windowMs }
      : existing;
    if (bucket.count >= limit) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000))));
      return next(Object.assign(new Error("Too many location searches. Please wait and try again."), { statusCode: 429 }));
    }
    bucket.count += 1;
    buckets.set(userId, bucket);
    next();
  };
}

module.exports = { createLocationRateLimit };
