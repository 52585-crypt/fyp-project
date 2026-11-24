/**
 * Small in-memory limiter for failed sign-in attempts (no extra dependency).
 * Counts failures per key (IP + phone); a successful login clears the key.
 * Note: memory is per process — fine for a single API instance.
 */
function createFailureLimiter({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const entries = new Map();

  function current(key) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.resetAt <= Date.now()) {
      entries.delete(key);
      return null;
    }
    return entry;
  }

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of entries) if (entry.resetAt <= now) entries.delete(key);
  }, windowMs);
  sweep.unref?.();

  return {
    /** Throws a 429 error when the key has used up its attempts. */
    assertAllowed(key, res) {
      const entry = current(key);
      if (entry && entry.count >= max) {
        const retryAfterSec = Math.ceil((entry.resetAt - Date.now()) / 1000);
        res?.set?.("Retry-After", String(retryAfterSec));
        const minutes = Math.ceil(retryAfterSec / 60);
        const err = new Error(`Too many failed sign-in attempts. Try again in ${minutes} minute${minutes > 1 ? "s" : ""}.`);
        err.statusCode = 429;
        throw err;
      }
    },
    recordFailure(key) {
      const entry = current(key);
      if (entry) entry.count += 1;
      else entries.set(key, { count: 1, resetAt: Date.now() + windowMs });
    },
    reset(key) {
      entries.delete(key);
    }
  };
}

function loginKey(req, phone) {
  return `${req.ip || req.socket?.remoteAddress || "unknown"}|${String(phone || "").trim()}`;
}

const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS) || 5;
const WINDOW_MS = (Number(process.env.LOGIN_LOCKOUT_MINUTES) || 15) * 60 * 1000;

const adminLoginLimiter = createFailureLimiter({ max: MAX_ATTEMPTS, windowMs: WINDOW_MS });
const userLoginLimiter = createFailureLimiter({ max: MAX_ATTEMPTS * 2, windowMs: WINDOW_MS });

module.exports = { createFailureLimiter, loginKey, adminLoginLimiter, userLoginLimiter };
