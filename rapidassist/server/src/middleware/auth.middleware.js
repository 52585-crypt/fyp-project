const { verifyAccessToken } = require("../utils/jwt");
const { User } = require("../models/User");
const { getAccessTokenFromCookies } = require("../utils/authCookie");

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
    const user = await User.findById(decoded.sub);

    if (!user) {
      const err = new Error("Unauthorized");
      err.statusCode = 401;
      throw err;
    }

    if (user.isBlocked) {
      const err = new Error("Account suspended");
      err.statusCode = 403;
      throw err;
    }

    req.user = user;
    next();
  } catch (err) {
    err.statusCode = err.statusCode || 401;
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    const err = new Error("Admin access required");
    err.statusCode = 403;
    next(err);
    return;
  }
  next();
}

module.exports = { requireAuth, requireAdmin };

