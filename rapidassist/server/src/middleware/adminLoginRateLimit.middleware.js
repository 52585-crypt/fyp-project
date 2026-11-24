// Each credential endpoint gets a separate process-local limiter.
function createAdminLoginRateLimit({
  limit = 10, windowMs = 15 * 60_000, now = Date.now,
  keyFor = (req) => req.ip || req.socket.remoteAddress || "unknown",
  message = "Too many admin login attempts. Please wait and try again."
} = {}) {
  const buckets = new Map();
  const maxBuckets = 10_000;
  let nextCleanupAt = 0;

  return function adminLoginRateLimit(req, res, next) {
    const currentTime = now();
    if (currentTime >= nextCleanupAt) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= currentTime) buckets.delete(key);
      }
      nextCleanupAt = currentTime + windowMs;
    }

    // Express ignores untrusted forwarding headers with its default proxy policy.
    const key = keyFor(req);
    let bucket = buckets.get(key);
    if (bucket && bucket.resetAt <= currentTime) {
      buckets.delete(key);
      bucket = null;
    }
    if (!bucket && buckets.size < maxBuckets) {
      bucket = { count: 0, resetAt: currentTime + windowMs };
      buckets.set(key, bucket);
    }
    if (!bucket || bucket.count >= limit) {
      const resetAt = bucket ? bucket.resetAt : nextCleanupAt;
      res.set("Retry-After", String(Math.max(1, Math.ceil((resetAt - currentTime) / 1000))));
      return next(Object.assign(new Error(message), {
        statusCode: 429
      }));
    }

    bucket.count += 1;
    return next();
  };
}

module.exports = { createAdminLoginRateLimit };
