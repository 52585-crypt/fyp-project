#!/usr/bin/env node
// Backfills providerState.locationPoint (GeoJSON, for $geoNear) from providerState.currentLocation and makes sure the
// 2dsphere index exists. Idempotent: users whose point already matches are skipped.
//
//   node scripts/migrateProviderLocationPoints.js            dry run against the local dev database
//   node scripts/migrateProviderLocationPoints.js --apply    write
//   options: --uri=...  --production-env (use server/.env)  --allow-remote (needed for Atlas or any non-local host)
const mongoose = require("mongoose");
const { User, pointFromLocation } = require("../src/models/User");
const { connectForScript } = require("./lib/scriptDatabase");

const INDEX = { "providerState.locationPoint": "2dsphere" };

/** Users whose stored point is missing or differs from currentLocation. */
async function planBackfill() {
  const users = await User.collection.find(
    { "providerState.currentLocation.lat": { $type: "number" }, "providerState.currentLocation.lng": { $type: "number" } },
    { projection: { "providerState.currentLocation": 1, "providerState.locationPoint": 1 } }
  ).toArray();
  return users.flatMap((user) => {
    const point = pointFromLocation(user.providerState.currentLocation);
    const current = user.providerState.locationPoint?.coordinates;
    if (!point || (current && current[0] === point.coordinates[0] && current[1] === point.coordinates[1])) return [];
    return [{ _id: user._id, point }];
  });
}

async function applyBackfill(plan) {
  await User.collection.createIndex(INDEX);
  if (!plan.length) return { modified: 0 };
  const result = await User.collection.bulkWrite(plan.map(({ _id, point }) => ({
    updateOne: { filter: { _id }, update: { $set: { "providerState.locationPoint": point } } }
  })));
  return { modified: result.modifiedCount };
}

async function main() {
  const args = process.argv.slice(2);
  await connectForScript(args);
  try {
    const plan = await planBackfill();
    console.log(`Users needing a location point: ${plan.length}${args.includes("--apply") ? "" : " (dry run, nothing written; add --apply)"}`);
    if (!args.includes("--apply")) return;
    const { modified } = await applyBackfill(plan);
    console.log(`Updated ${modified} user(s); 2dsphere index on providerState.locationPoint ensured.`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) main().catch((error) => { console.error("Migration failed:", error.message); process.exitCode = 1; });

module.exports = { applyBackfill, planBackfill };
