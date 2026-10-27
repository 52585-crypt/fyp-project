require("dotenv").config();

const { createApp } = require("./app");
const { connectDB } = require("./config/db");
const { createServer } = require("node:http");
const { attachRealtime } = require("./services/realtime");
const { startDispatchWorker } = require("./services/dispatch");
const { ensureAdminAccount } = require("./services/adminBootstrap");

async function main() {
  const port = process.env.PORT || 4000;

  await connectDB(process.env.MONGODB_URI);
  await ensureAdminAccount();

  const app = createApp();
  const server = createServer(app);
  attachRealtime(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const stopDispatch = startDispatchWorker();
  server.on("close", () => { void stopDispatch().catch((err) => console.error("Dispatch shutdown failed:", err)); });
  server.on("error", (err) => {
    console.error("HTTP server failed:", err);
    process.exit(1);
  });
  console.log(`RapidAssist API running on port ${port}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
