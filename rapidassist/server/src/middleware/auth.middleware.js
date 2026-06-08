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

    req.user = user;
    next();
  } catch (err) {
    err.statusCode = err.statusCode || 401;
    next(err);
  }
}

module.exports = { requireAuth };

