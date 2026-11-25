const { verifyAccessToken, tokenVersionMatches } = require("../utils/jwt");
const { User } = require("../models/User");
const { getAccessTokenFromCookies } = require("../utils/authCookie");
const { isObjectIdOrHexString } = require("mongoose");
const { sessionRole } = require("../utils/accountRoles");

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");

  if (type !== "Bearer" || !token) return null;
  return token;
}

async function readSession(req, { adminOnly = false } = {}) {
  const token = getBearerToken(req) || getAccessTokenFromCookies(req);
  if (!token) return null;
  const decoded = verifyAccessToken(token);
  if (!decoded || typeof decoded !== "object" || !isObjectIdOrHexString(decoded.sub)) return null;
  if (adminOnly && decoded.role && decoded.role !== "admin") return null;
  const query = User.findById(decoded.sub);
  if (adminOnly) query.select("role roles tokenVersion");
  const user = await query;
  if (user && !tokenVersionMatches(decoded, user)) return null;
  const role = user && sessionRole(user, decoded.role);
  return role && (!adminOnly || role === "admin") ? { user, role } : null;
}

async function requireAuth(req, res, next) {
  try {
    const session = await readSession(req);
    if (!session) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    req.authRole = session.role;
    req.user = session.user;
    next();
  } catch (err) {
    if (["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(err.name)) {
      err = Object.assign(new Error("Session expired or invalid. Please sign in again."), { statusCode: 401 });
    }
    next(err);
  }
}

function requireRole(...roles) {
  return [
    requireAuth,
    (req, res, next) => {
      if (roles.includes(req.authRole)) return next();
      const err = new Error("Forbidden");
      err.statusCode = 403;
      next(err);
    }
  ];
}

const requireAdmin = requireRole("admin");

module.exports = { requireAuth, requireRole, requireAdmin, readSession };
