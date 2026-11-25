#!/usr/bin/env node
// Demo providers across Islamabad and Rawalpindi so the customer map is not empty during a demo.
// They are marked providerState.isDemo: shown on the map, never offered real jobs, and cannot log in.
//
//   node scripts/seedDemoProviders.js                 create/refresh the 18 demo providers (local dev database)
//   node scripts/seedDemoProviders.js --keep-fresh    ...then keep their location timestamps fresh every 60 s (Ctrl-C to stop)
//   node scripts/seedDemoProviders.js --remove        delete them again
//   options: --uri=...  --production-env (use server/.env)  --allow-remote (needed for Atlas or any non-local host)
//
// Providers only appear while their location is fresher than 3 minutes (the dispatch freshness rule), so run with
// --keep-fresh during a demo.
const { randomBytes } = require("node:crypto");
const mongoose = require("mongoose");
const { User } = require("../src/models/User");
const { connectForScript } = require("./lib/scriptDatabase");

const DEMO_PHONE_PREFIX = "03990000"; // 0399 is not an allocated Pakistani mobile prefix
const REFRESH_MS = 60_000;

// Points: the 12 app landmarks (OpenStreetMap) plus 6 short offsets from them.
const SPOTS = [
  ["Blue Area", 33.71276, 73.063], ["F-6 Markaz", 33.7294, 73.0765], ["F-7 Markaz", 33.72047, 73.05631],
  ["G-9 Markaz", 33.68925, 73.03252], ["I-8 Markaz", 33.6679, 73.07454], ["Faizabad", 33.6621, 73.0839],
  ["Saddar Rawalpindi", 33.59544, 73.05323], ["Committee Chowk", 33.61386, 73.06517], ["Bahria Town Phase 4", 33.55024, 73.12397],
  ["DHA Phase 2", 33.53066, 73.15703], ["PWD", 33.57128, 73.1448], ["Gulberg Greens", 33.60022, 73.21186],
  ["near Blue Area", 33.7168, 73.0702], ["near G-9 Markaz", 33.6853, 73.0391], ["near Faizabad", 33.6559, 73.0771],
  ["near Saddar Rawalpindi", 33.6012, 73.0451], ["near Bahria Town Phase 4", 33.5441, 73.1162], ["near PWD", 33.5768, 73.1371]
];
const CATEGORIES = ["mechanic", "fuel_delivery", "towing"];
const LABELS = { mechanic: "Mechanic", fuel_delivery: "Fuel", towing: "Towing" };

function demoProviders(now = new Date()) {
  return SPOTS.map(([area, lat, lng], index) => {
    const category = CATEGORIES[index % CATEGORIES.length];
    return {
      phone: `${DEMO_PHONE_PREFIX}${String(index + 1).padStart(3, "0")}`,
      name: `Demo ${LABELS[category]} · ${area.replace(/^near /, "")}`,
      category,
      ratingAvg: Math.round((3.8 + ((index * 7) % 12) / 10) * 10) / 10,
      ratingCount: 5 + ((index * 13) % 60),
      completedJobs: 3 + ((index * 17) % 90),
      location: { lat, lng, addressText: `Demo location, ${area}`, accuracy: 15, capturedAt: now, receivedAt: now, updatedAt: now }
    };
  });
}

async function seed(now = new Date()) {
  const unusablePassword = await User.hashPassword(randomBytes(24).toString("hex"));
  let created = 0;
  for (const demo of demoProviders(now)) {
    const result = await User.updateOne({ phone: demo.phone }, {
      $set: {
        name: demo.name, role: "mechanic", roles: ["mechanic"], verificationStatus: "verified", isCertified: true,
        "mechanicProfile.serviceCategory": demo.category,
        ratingAvg: demo.ratingAvg, ratingCount: demo.ratingCount, completedJobs: demo.completedJobs,
        "providerState.isOnline": true, "providerState.isDemo": true,
        "providerState.currentLocation": demo.location, "providerState.lastSeenAt": now
      },
      $setOnInsert: { phone: demo.phone, authProvider: "local", passwordHash: unusablePassword }
    }, { upsert: true });
    created += result.upsertedCount;
  }
  return { total: SPOTS.length, created };
}

/** Moves only the timestamps forward; positions stay where they were seeded. */
async function refresh(now = new Date()) {
  const result = await User.updateMany({ "providerState.isDemo": true, phone: { $regex: `^${DEMO_PHONE_PREFIX}` } }, { $set: {
    "providerState.currentLocation.capturedAt": now, "providerState.currentLocation.receivedAt": now,
    "providerState.currentLocation.updatedAt": now, "providerState.lastSeenAt": now
  } });
  return result.modifiedCount;
}

async function remove() {
  const result = await User.deleteMany({ "providerState.isDemo": true, phone: { $regex: `^${DEMO_PHONE_PREFIX}` } });
  return result.deletedCount;
}

async function main() {
  const args = process.argv.slice(2);
  await connectForScript(args);
  try {
    if (args.includes("--remove")) {
      console.log(`Removed ${await remove()} demo provider(s).`);
      return;
    }
    const { total, created } = await seed();
    console.log(`Demo providers ready: ${total} (${created} new, ${total - created} refreshed) across Islamabad and Rawalpindi.`);
    if (!args.includes("--keep-fresh")) {
      console.log("They disappear from the map after 3 minutes without a fresh location; use --keep-fresh during a demo.");
      return;
    }
    console.log(`Keeping demo locations fresh every ${REFRESH_MS / 1000} s. Press Ctrl-C to stop.`);
    await new Promise((resolve) => {
      const timer = setInterval(() => { refresh().catch((error) => console.error("Refresh failed:", error.message)); }, REFRESH_MS);
      process.once("SIGINT", () => { clearInterval(timer); resolve(); });
    });
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) main().catch((error) => { console.error("Seeding failed:", error.message); process.exitCode = 1; });

module.exports = { DEMO_PHONE_PREFIX, SPOTS, demoProviders, refresh, remove, seed };
