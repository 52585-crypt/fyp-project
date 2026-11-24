const { loadServerEnv } = require("./config/env");

loadServerEnv({ development: process.argv.includes("--development") });

const { createApp } = require("./app");
const { connectDB } = require("./config/db");
const { createServer } = require("node:http");
const { attachRealtime } = require("./services/realtime");
const { startDispatchWorker } = require("./services/dispatch");
const { ensureAdminAccount } = require("./services/adminBootstrap");
const { startGoogleLocationCleanup } = require("./services/googleLocationCleanup");

async function main() {
  const port = Number(process.env.PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw Object.assign(new Error("Invalid PORT"), { code: "INVALID_PORT" });
  }
  const app = createApp();
  let ready = false;
  const server = createServer((req, res) => {
    if (ready) return app(req, res);
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, message: "The API is starting. Please try again shortly." }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  await connectDB(process.env.MONGODB_URI);
  await ensureAdminAccount();
  const stopLocationCleanup = await startGoogleLocationCleanup();
  attachRealtime(server);
  const stopDispatch = startDispatchWorker();
  server.on("close", () => { void stopDispatch().catch((err) => console.error("Dispatch shutdown failed:", err)); });
  server.on("close", stopLocationCleanup);
  server.on("error", (err) => {
    console.error("HTTP server failed.", err.code);
    process.exit(1);
  });
  ready = true;
  console.log(`RapidAssist API running on port ${port}`);
}

main().catch((err) => {
  if (err.code === "EADDRINUSE") {
    console.error("API port is already in use. Choose an available PORT for this backend.");
  } else if (err.code === "INVALID_PORT") {
    console.error("PORT must be an integer between 1 and 65535.");
  } else if (err.name === "MongooseServerSelectionError") {
    const servers = [...(err.reason?.servers?.values() ?? [])];
    const connectionsRefused = servers.length > 0 && servers.every(
      ({ error }) => error?.cause?.code === "ECONNREFUSED"
    );
    if (connectionsRefused) {
      console.error("MongoDB refused the connection (ECONNREFUSED). Start the MongoDB instance configured in MONGODB_URI and verify its port.");
    } else {
      console.error("MongoDB could not select a server. Check the configured host, network access, and replica set health.");
    }
  } else {
    console.error("API startup failed. Check database connectivity and server configuration.", err.name);
  }
  process.exit(1);
});
