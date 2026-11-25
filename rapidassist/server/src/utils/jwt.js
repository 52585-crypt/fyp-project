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

/**
 * True when the token's version (`tv`) matches the user's current tokenVersion.
 * Tokens issued before versioning have no `tv` and stay valid until they expire.
 */
function tokenVersionMatches(decoded, user) {
  return decoded?.tv === undefined || decoded.tv === (user?.tokenVersion ?? 0);
}

module.exports = { signAccessToken, verifyAccessToken, tokenVersionMatches };

