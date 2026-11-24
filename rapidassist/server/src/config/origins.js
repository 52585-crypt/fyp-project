function trustedOrigins() {
  const configured = (process.env.CORS_ORIGIN || "").split(",").map(origin => origin.trim()).filter(Boolean);
  if (process.env.NODE_ENV === "production" && !configured.length) {
    throw new Error("CORS_ORIGIN must contain explicit trusted origins in production");
  }
  if (configured.some(origin => exactOrigin(origin) === null)) {
    throw new Error("CORS_ORIGIN must contain only exact HTTP or HTTPS origins");
  }
  return new Set(configured.length ? configured : [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:8081", "http://127.0.0.1:8081",
    "http://localhost:19006", "http://127.0.0.1:19006"
  ]);
}

function exactOrigin(origin) {
  if (typeof origin !== "string") return null;
  try {
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && url.origin === origin ? url : null;
  } catch {
    return null;
  }
}

module.exports = { trustedOrigins, exactOrigin };
