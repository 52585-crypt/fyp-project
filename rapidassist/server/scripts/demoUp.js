#!/usr/bin/env node
// One command for an FYP demo on the LOCAL dev database: the 18 map-only demo providers plus three accounts you can
// sign in with, then prints the credentials.
//
//   node scripts/demoUp.js                 seed / reset everything (local dev database from .env.development.local)
//   node scripts/demoUp.js --keep-fresh    ...then keep the demo providers' locations fresh (Ctrl-C to stop)
//   node scripts/demoUp.js --uri=mongodb://127.0.0.1:27018/rapidassist_dev
//
// Remote databases (Atlas or any non-local host) are always refused: unlike the other maintenance scripts there is
// no --allow-remote, because these accounts have published passwords. Re-running resets the passwords to the ones
// below; nothing else in the database is touched.
const mongoose = require("mongoose");
const { User } = require("../src/models/User");
const { connectForScript } = require("./lib/scriptDatabase");
const demoProviders = require("./seedDemoProviders");

// 0399 is not an allocated Pakistani mobile prefix; 039910… is outside the map-only providers' 03990000… range.
const DEMO_ACCOUNTS = Object.freeze([
  { key: "customer", role: "user", name: "Demo Customer", phone: "03991000001", password: "Demo#2026" },
  { key: "provider", role: "mechanic", name: "Demo Mechanic (live)", phone: "03991000002", password: "Demo#2026", serviceCategory: "mechanic" },
  { key: "admin", role: "admin", name: "Demo Admin", email: "demo-admin@rapidassist.local", password: "DemoAdmin#2026" }
]);

/** The demo provider is a real, verified provider (not isDemo): it can go online and accept dispatched jobs. */
function accountFields(account) {
  const base = { name: account.name, role: account.role, roles: [account.role] };
  if (account.role === "user") return { ...base, phone: account.phone, phoneVerified: true };
  if (account.role === "mechanic") {
    return {
      ...base, phone: account.phone, phoneVerified: true, verificationStatus: "verified", isCertified: true,
      "mechanicProfile.serviceCategory": account.serviceCategory, "providerState.isDemo": false
    };
  }
  return { ...base, email: account.email };
}

async function upsertAccounts() {
  const created = [];
  for (const account of DEMO_ACCOUNTS) {
    const filter = account.email ? { email: account.email } : { phone: account.phone };
    const result = await User.updateOne(filter, {
      $set: { ...accountFields(account), passwordHash: await User.hashPassword(account.password) },
      $setOnInsert: { authProvider: "local" }
    }, { upsert: true });
    if (result.upsertedCount) created.push(account.key);
  }
  return created;
}

/** Everything the demo needs; returns what was created. */
async function demoUp(now = new Date()) {
  const providers = await demoProviders.seed(now);
  const accounts = await upsertAccounts();
  return { providers, accounts };
}

function credentialsText() {
  const [customer, provider, admin] = DEMO_ACCOUNTS;
  return [
    "Demo accounts (local dev database only):",
    `  Customer app   phone ${customer.phone}   password ${customer.password}`,
    `  Provider app   phone ${provider.phone}   password ${provider.password}   (Mechanic, verified; go online from inside Islamabad/Rawalpindi)`,
    `  Admin panel    email ${admin.email}   password ${admin.password}`,
    "Stripe test card: 4242 4242 4242 4242, any future expiry, any CVC."
  ].join("\n");
}

async function main() {
  // Never remote: --allow-remote is dropped, so the shared guard refuses any non-local host.
  const args = process.argv.slice(2).filter((arg) => arg !== "--allow-remote");
  if (args.includes("--production-env")) throw new Error("demoUp only runs against the local dev database; --production-env is not allowed.");
  await connectForScript(args);
  try {
    const { providers, accounts } = await demoUp();
    console.log(`Demo providers on the map: ${providers.total} (${providers.created} new).`);
    console.log(`Demo accounts: ${DEMO_ACCOUNTS.length} (${accounts.length ? `new: ${accounts.join(", ")}` : "all existed; passwords reset"}).`);
    console.log("");
    console.log(credentialsText());
    if (!args.includes("--keep-fresh")) {
      console.log("\nMap providers disappear after 3 minutes without a fresh location; re-run with --keep-fresh during the demo.");
      return;
    }
    console.log("\nKeeping demo provider locations fresh every 60 s. Press Ctrl-C to stop.");
    await new Promise((resolve) => {
      const timer = setInterval(() => { demoProviders.refresh().catch((e) => console.error("Refresh failed:", e.message)); }, 60_000);
      process.once("SIGINT", () => { clearInterval(timer); resolve(); });
    });
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) main().catch((error) => { console.error("demoUp failed:", error.message); process.exitCode = 1; });

module.exports = { DEMO_ACCOUNTS, credentialsText, demoUp };
