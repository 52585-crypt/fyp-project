const { verifyAccessToken } = require("../utils/jwt");
const { User } = require("../models/User");
const { getAccessTokenFromCookies } = require("../utils/authCookie");
const { isObjectIdOrHexString } = require("mongoose");

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");

  if (type !== "Bearer" || !token) return null;
  return token;
}

async function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req) || getAccessTokenFromCookies(req);

    if (!token) {
      const err = new Error("Unauthorized");
      err.statusCode = 401;
      throw err;
    }

    const decoded = verifyAccessToken(token);
    if (!decoded || typeof decoded !== "object" || !isObjectIdOrHexString(decoded.sub)) {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    }
    const user = await User.findById(decoded.sub);

    if (!user) {
      const err = new Error("Unauthorized");
      err.statusCode = 401;
      throw err;
    }

    req.user = user;
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
      if (roles.includes(req.user?.role)) return next();
      const err = new Error("Forbidden");
      err.statusCode = 403;
      next(err);
    }
  ];
}

const requireAdmin = requireRole("admin");

module.exports = { requireAuth, requireRole, requireAdmin };
