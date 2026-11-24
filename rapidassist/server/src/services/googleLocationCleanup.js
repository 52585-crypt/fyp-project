const { ServiceRequest } = require("../models/ServiceRequest");
const { getGoogleLocationCacheCutoff } = require("./googleLocationPolicy");

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

async function cleanupGoogleLocations(now = new Date()) {
  const cutoff = getGoogleLocationCacheCutoff(now);
  for (const field of ["pickupLocation", "destinationLocation"]) {
    const cachedAt = `${field}.googleContentCachedAt`;
    await ServiceRequest.updateMany({
      [`${field}.source`]: "google_places",
      $and: [
        { $or: [{ [cachedAt]: { $not: { $type: "date" } } }, { [cachedAt]: { $lte: cutoff } }, { [cachedAt]: { $gt: now } }] },
        { $or: [{ [`${field}.lat`]: { $exists: true } }, { [`${field}.lng`]: { $exists: true } }, { [`${field}.addressText`]: { $ne: null } }] }
      ]
    }, { $unset: { [`${field}.lat`]: 1, [`${field}.lng`]: 1, [`${field}.addressText`]: 1 } }, { timestamps: false });
  }
}

async function startGoogleLocationCleanup() {
  await cleanupGoogleLocations();
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await cleanupGoogleLocations(); }
    catch (error) { console.error("Google location cleanup:", error.message); }
    finally { running = false; }
  }, CLEANUP_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { cleanupGoogleLocations, startGoogleLocationCleanup, CLEANUP_INTERVAL_MS };
