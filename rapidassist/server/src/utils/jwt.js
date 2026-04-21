const jwt = require("jsonwebtoken");

function signAccessToken(payload) {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  if (!secret) {
    const err = new Error("JWT_SECRET is missing");
    err.statusCode = 500;
    throw err;
  }
  return jwt.sign(payload, secret, { expiresIn });
}

function verifyAccessToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error("JWT_SECRET is missing");
    err.statusCode = 500;
    throw err;
  }
  return jwt.verify(token, secret);
}

module.exports = { signAccessToken, verifyAccessToken };

