// One pending offer per provider, enforced by MongoDB (in addition to User.providerState.reservedOfferId).
//
// Deliberately NOT declared in the DispatchOffer schema: Mongoose's automatic index build swallows a failure
// (e.g. existing duplicates) and then skips the model's remaining indexes silently. Instead the server builds it
// explicitly at startup and, if that fails, logs a warning and keeps running on the reservation guard alone.
// Manual fix: docs/smart-matching/05-schema-api-events.md §3 (scripts/cleanupPendingOffers.js).

const { DispatchOffer } = require("../models/DispatchOffer");

const PENDING_OFFER_INDEX_NAME = "one_pending_offer_per_provider";
const PENDING_OFFER_INDEX_KEY = Object.freeze({ providerId: 1 });
const PENDING_OFFER_INDEX_OPTIONS = Object.freeze({
  name: PENDING_OFFER_INDEX_NAME,
  unique: true,
  partialFilterExpression: { outcome: "offered" }
});

/** True when `error` is a duplicate-key error raised by this index (not, say, the unique offerId index). */
function isPendingOfferConflict(error) {
  if (error?.code !== 11000) return false;
  if (error.keyPattern) return Object.keys(error.keyPattern).length === 1 && "providerId" in error.keyPattern;
  return String(error.message || "").includes(PENDING_OFFER_INDEX_NAME);
}

async function pendingOfferIndexExists() {
  try {
    const indexes = await DispatchOffer.collection.indexes();
    return indexes.some((index) => index.name === PENDING_OFFER_INDEX_NAME);
  } catch (error) {
    if (error?.codeName === "NamespaceNotFound" || error?.code === 26) return false;
    throw error;
  }
}

/** Builds the index if missing. Never throws: returns { ok, reason } and logs a warning on failure. */
async function ensurePendingOfferIndex({ logger = console } = {}) {
  try {
    await DispatchOffer.collection.createIndex(PENDING_OFFER_INDEX_KEY, PENDING_OFFER_INDEX_OPTIONS);
    return { ok: true, reason: null };
  } catch (error) {
    const reason = error?.code === 11000 ? "duplicates" : "error";
    logger.warn(
      `[dispatch] WARNING: could not build MongoDB index "${PENDING_OFFER_INDEX_NAME}" `
      + `(${reason === "duplicates" ? "some providers already have more than one pending offer" : error?.message}). `
      + "The server keeps running and still allows one pending offer per provider through provider reservations, "
      + "but the database does not enforce it. Fix: run `node scripts/cleanupPendingOffers.js --confirm-local-dev` "
      + "(dry run), review it, re-run with --apply, then restart the server. See docs/smart-matching/05-schema-api-events.md."
    );
    return { ok: false, reason, error };
  }
}

module.exports = {
  PENDING_OFFER_INDEX_KEY,
  PENDING_OFFER_INDEX_NAME,
  PENDING_OFFER_INDEX_OPTIONS,
  ensurePendingOfferIndex,
  isPendingOfferConflict,
  pendingOfferIndexExists
};
