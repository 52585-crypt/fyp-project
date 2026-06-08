const ACCESS_TOKEN_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "rapidassist_access_token";
const DEFAULT_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function getCookieMaxAge() {
  const configured = Number(process.env.AUTH_COOKIE_MAX_AGE_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return DEFAULT_COOKIE_MAX_AGE_MS;
}

function getCookieSameSite() {
  return process.env.AUTH_COOKIE_SAMESITE || "lax";
}

function getCookieSecure() {
  if (process.env.AUTH_COOKIE_SECURE === "true") return true;
  if (process.env.AUTH_COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

function getAccessTokenCookieOptions() {
  return {
    httpOnly: true,
    secure: getCookieSecure(),
    sameSite: getCookieSameSite(),
    maxAge: getCookieMaxAge(),
    path: "/"
  };
}

function getClearCookieOptions() {
  const { maxAge, ...options } = getAccessTokenCookieOptions();
  return options;
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};

  return String(cookieHeader)
    .split(";")
    .reduce((cookies, pair) => {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex === -1) return cookies;

      const key = pair.slice(0, separatorIndex).trim();
      const rawValue = pair.slice(separatorIndex + 1).trim();
      if (!key) return cookies;

      try {
        cookies[key] = decodeURIComponent(rawValue);
      } catch {
        cookies[key] = rawValue;
      }

      return cookies;
    }, {});
}

function getAccessTokenFromCookies(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[ACCESS_TOKEN_COOKIE_NAME] || null;
}

function setAccessTokenCookie(res, token) {
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, token, getAccessTokenCookieOptions());
}

function clearAccessTokenCookie(res) {
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, getClearCookieOptions());
}

module.exports = {
  ACCESS_TOKEN_COOKIE_NAME,
  clearAccessTokenCookie,
  getAccessTokenFromCookies,
  setAccessTokenCookie
};
