#!/usr/bin/env node
/**
 * Starts an isolated QA stack and keeps it running until Ctrl+C:
 *   1. a throwaway MongoDB replica set (mongodb-memory-server, from server/node_modules)
 *   2. a tiny local OSRM "route" stub so towing estimates do not depend on the public OSRM server
 *   3. the real RapidAssist API (server/src/index.js) on port 4000 with QA-only env overrides.
 *
 * Environment variables passed here take precedence over server/.env (dotenv never overrides existing vars),
 * so the developer's Atlas database, AWS bucket, Stripe and Groq keys are never touched.
 */
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SERVER_DIR = path.join(ROOT, "server");
const { MongoMemoryReplSet } = require(path.join(SERVER_DIR, "node_modules/mongodb-memory-server"));

const API_PORT = Number(process.env.QA_API_PORT || 4000);
const OSRM_PORT = Number(process.env.QA_OSRM_PORT || 5099);
const STATE_FILE = path.join(__dirname, "..", ".stack.json");
const LOG_FILE = path.join(__dirname, "..", "results", "server.log");

const QA_ADMIN = { email: "qa-admin@rapidassist.test", password: "QaAdminPass#2026" };

function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function startOsrmStub() {
  // GET /route/v1/driving/{lng},{lat};{lng},{lat} -> road distance = 1.3 x straight line, 40 km/h.
  const server = http.createServer((req, res) => {
    const match = /\/route\/v1\/driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/.exec(req.url);
    res.setHeader("Content-Type", "application/json");
    if (!match) { res.statusCode = 404; return res.end(JSON.stringify({ code: "InvalidUrl" })); }
    const [, lng1, lat1, lng2, lat2] = match.map(Number);
    const km = Math.max(0.2, haversineKm({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }) * 1.3);
    res.end(JSON.stringify({ code: "Ok", routes: [{ distance: km * 1000, duration: (km / 40) * 3600 }] }));
  });
  return new Promise((resolve) => server.listen(OSRM_PORT, "127.0.0.1", () => resolve(server)));
}

async function waitForHealth(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not become healthy at ${url}`);
}

async function main() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  const mongoUri = replSet.getUri("rapidassist_test");
  const osrm = await startOsrmStub();

  const env = {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(API_PORT),
    MONGODB_URI: mongoUri,
    JWT_SECRET: "qa-only-jwt-secret-" + "x".repeat(32),
    JWT_EXPIRES_IN: "7d",
    ADMIN_EMAIL: QA_ADMIN.email,
    ADMIN_PASSWORD: QA_ADMIN.password,
    ADMIN_PHONE: "admin-system",
    ADMIN_NAME: "QA Admin",
    // Never reach external paid/real services from QA.
    GROQ_API_KEY: "",
    GOOGLE_CLIENT_IDS: "",
    GOOGLE_MAPS_SERVER_API_KEY: "",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    MECHANIC_VERIFICATION_BUCKET: "",
    AWS_CONFIG_FILE: "/nonexistent-qa-aws-config",
    AWS_SHARED_CREDENTIALS_FILE: "/nonexistent-qa-aws-credentials",
    AI_PRELOAD: "false",
    DISPATCH_ROUTING_MODE: "fallback",
    DISPATCH_DEBUG: "false",
    OSRM_ROUTE_URL: `http://127.0.0.1:${OSRM_PORT}/route/v1/driving`,
    CORS_ORIGIN: [5173, 4173, 8081, 19006].flatMap((p) => [`http://localhost:${p}`, `http://127.0.0.1:${p}`]).join(",")
  };

  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  const log = fs.createWriteStream(LOG_FILE, { flags: "w" });
  const child = spawn(process.execPath, ["src/index.js"], { cwd: SERVER_DIR, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log);
  child.stderr.pipe(log);

  const shutdown = async (code = 0) => {
    child.kill("SIGTERM");
    osrm.close();
    await replSet.stop().catch(() => {});
    fs.rmSync(STATE_FILE, { force: true });
    process.exit(code);
  };
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  child.on("exit", (code) => {
    console.error(`API process exited with code ${code}. See ${LOG_FILE}`);
    shutdown(1);
  });

  const health = await waitForHealth(`http://127.0.0.1:${API_PORT}/health`);
  fs.writeFileSync(STATE_FILE, JSON.stringify({
    apiUrl: `http://127.0.0.1:${API_PORT}`, mongoUri, admin: QA_ADMIN, jwtSecret: env.JWT_SECRET, startedAt: new Date().toISOString()
  }, null, 2));
  console.log("QA stack ready", JSON.stringify({ health, apiUrl: `http://127.0.0.1:${API_PORT}`, mongoUri }));
}

main().catch((error) => {
  console.error("QA stack failed to start:", error);
  process.exit(1);
});
