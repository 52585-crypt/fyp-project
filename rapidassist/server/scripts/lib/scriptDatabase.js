// Shared connection guard for maintenance scripts: local/dev database by default, never a remote one by accident.
const mongoose = require("mongoose");
const { loadServerEnv } = require("../../src/config/env");

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function describeUri(uri) {
  const match = /^(mongodb(?:\+srv)?):\/\/(?:[^@/]*@)?([^/?]+)(\/[^?]*)?/.exec(uri || "");
  if (!match) return null;
  const hosts = match[2].split(",").map((host) => host.replace(/:\d+$/, "").toLowerCase());
  return {
    remote: match[1] === "mongodb+srv" || hosts.some((host) => !LOOPBACK.has(host)),
    display: `${match[1]}://${match[2]}${match[3] || ""} (credentials hidden)`
  };
}

/**
 * Connects using --uri=..., otherwise the server's own env files: .env.development.local first (local dev database),
 * unless --production-env is given (server/.env only). Remote hosts need --allow-remote.
 */
async function connectForScript(args, log = console.log) {
  const explicit = args.find((arg) => arg.startsWith("--uri="))?.slice(6);
  if (!explicit) loadServerEnv({ development: !args.includes("--production-env") });
  const uri = explicit || process.env.MONGODB_URI;
  const target = describeUri(uri);
  if (!target) throw new Error("No MongoDB connection string (pass --uri=... or set MONGODB_URI).");
  if (target.remote && !args.includes("--allow-remote")) {
    throw new Error(`Refusing to use a remote database (${target.display}) without --allow-remote.`);
  }
  log(`Target: ${target.display}`);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  return mongoose.connection;
}

module.exports = { connectForScript, describeUri };
