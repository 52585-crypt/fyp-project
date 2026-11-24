#!/usr/bin/env node
// Resolves duplicate pending DispatchOffers (several outcome:"offered" records for one provider) so the unique
// index "one_pending_offer_per_provider" can be built. Local/dev databases only.
//
//   node scripts/cleanupPendingOffers.js --confirm-local-dev --uri=mongodb://127.0.0.1:27018/<db>   (dry run)
//   node scripts/cleanupPendingOffers.js --confirm-local-dev --uri=... --apply [--build-index]
//
// Options:
//   --uri=<mongodb uri>     connection string (or MONGODB_URI in the environment; .env files are never read)
//   --confirm-local-dev     required: you confirm the target is a local/dev database
//   --allow-non-localhost   additionally required when any host is not 127.0.0.1 / localhost / ::1
//   --apply                 write changes (default is a dry run that writes nothing)
//   --dry-run               explicit dry run (the default)
//   --stale-outcome=withdrawn|expired   outcome for stale duplicates (default withdrawn: not counted against
//                           the provider's acceptance; "expired" would count as an ignored offer)
//   --build-index           after --apply, build the index
//
// Rules: only DispatchOffer records with outcome "offered" that belong to a provider with more than one such record
// are considered. Service requests, users, and offers with any other outcome (accepted, declined, …) are never
// modified. Within a duplicate group: the offer that is still live for its request is kept; an offer whose request
// was already accepted by this provider is marked "accepted" (that is what happened); every other one is stale and
// gets --stale-outcome. Every write is conditional on outcome "offered", so re-running is safe and a second run
// finds nothing.

const mongoose = require("mongoose");

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const STALE_OUTCOMES = new Set(["withdrawn", "expired"]);

function parseArgs(argv) {
  const args = { apply: false, confirm: false, allowNonLocalhost: false, buildIndex: false, staleOutcome: "withdrawn", uri: null, errors: [] };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg === "--dry-run") args.explicitDryRun = true;
    else if (arg === "--confirm-local-dev") args.confirm = true;
    else if (arg === "--allow-non-localhost") args.allowNonLocalhost = true;
    else if (arg === "--build-index") args.buildIndex = true;
    else if (arg.startsWith("--uri=")) args.uri = arg.slice("--uri=".length);
    else if (arg.startsWith("--stale-outcome=")) args.staleOutcome = arg.slice("--stale-outcome=".length);
    else args.errors.push(`Unknown option: ${arg}`);
  }
  if (!STALE_OUTCOMES.has(args.staleOutcome)) args.errors.push("--stale-outcome must be withdrawn or expired");
  if (args.apply && args.explicitDryRun) args.errors.push("Use either --apply or --dry-run, not both");
  return args;
}

/** Hosts and a credential-free description of a MongoDB URI. */
function describeUri(uri) {
  const match = /^(mongodb(?:\+srv)?):\/\/(?:[^@/]*@)?([^/?]+)(\/[^?]*)?/.exec(uri || "");
  if (!match) return null;
  const [, scheme, hostList, path] = match;
  const hosts = hostList.split(",").map((host) => host.replace(/:\d+$/, "").toLowerCase());
  const database = (path || "/").slice(1) || "(default)";
  return { scheme, hosts, database, display: `${scheme}://${hostList}/${database === "(default)" ? "" : database} (credentials hidden)` };
}

/** Refusal reasons; empty when the CLI may connect. */
function safetyErrors(args, env = process.env) {
  const errors = [...args.errors];
  if (env.NODE_ENV === "production") errors.push("Refusing to run with NODE_ENV=production.");
  if (!args.confirm) errors.push("Refusing to run without --confirm-local-dev (this script is for local/dev databases only).");
  const uri = args.uri || env.MONGODB_URI;
  const target = describeUri(uri);
  if (!uri) errors.push("No connection string: pass --uri=mongodb://127.0.0.1:<port>/<database> (.env files are not read).");
  else if (!target) errors.push("Unrecognised MongoDB connection string.");
  else if (target.scheme === "mongodb+srv" || target.hosts.some((host) => !LOOPBACK_HOSTS.has(host))) {
    if (!args.allowNonLocalhost) errors.push(`Target ${target.hosts.join(", ")} is not localhost: add --allow-non-localhost only if it is a dev database.`);
  }
  return errors;
}

function classify(offer, request, providerId, now) {
  const dispatch = request?.dispatch || {};
  if (request && String(request.providerId) === providerId && dispatch.offerId === offer.offerId) {
    return { kind: "assigned", why: `request already accepted by this provider (status ${request.status})` };
  }
  const live = request
    && request.status === "searching_provider"
    && dispatch.state === "offered"
    && dispatch.offerId === offer.offerId
    && String(dispatch.offeredProviderId) === providerId
    && dispatch.expiresAt > now;
  if (live) return { kind: "live", why: "request is currently offered to this provider and not expired" };
  if (!request) return { kind: "stale", why: "request no longer exists" };
  return { kind: "stale", why: `request no longer references this offer (status ${request.status}, dispatch ${dispatch.state || "none"})` };
}

/** Reads only. Returns the duplicate groups and the action for every offer in them. */
async function planCleanup({ connection = mongoose.connection, now = new Date(), staleOutcome = "withdrawn" } = {}) {
  const db = connection.db;
  const groups = await db.collection("dispatchoffers").aggregate([
    { $match: { outcome: "offered" } },
    { $sort: { offeredAt: -1, _id: 1 } },
    { $group: { _id: "$providerId", count: { $sum: 1 }, offers: { $push: { _id: "$_id", offerId: "$offerId", requestId: "$requestId", offeredAt: "$offeredAt", expiresAt: "$expiresAt" } } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray();

  const planned = [];
  for (const group of groups) {
    const providerId = String(group._id);
    const provider = await db.collection("users").findOne({ _id: group._id }, { projection: { "providerState.reservedOfferId": 1 } });
    const reservedOfferId = provider?.providerState?.reservedOfferId ?? null;
    const requests = await db.collection("servicerequests")
      .find({ _id: { $in: group.offers.map((offer) => offer.requestId) } }, { projection: { status: 1, providerId: 1, acceptedAt: 1, dispatch: 1 } })
      .toArray();
    const byId = new Map(requests.map((request) => [String(request._id), request]));
    const offers = group.offers.map((offer) => {
      const request = byId.get(String(offer.requestId));
      return { ...offer, request, ...classify(offer, request, providerId, now) };
    });
    const live = offers.filter((offer) => offer.kind === "live");
    const keeper = live.find((offer) => offer.offerId === reservedOfferId) || live[0] || null; // offers are newest first
    for (const offer of offers) {
      if (offer === keeper) offer.action = "keep";
      else if (offer.kind === "assigned") offer.action = "accepted";
      else {
        offer.action = staleOutcome;
        if (offer.kind === "live") offer.why = "also live, but the provider's reservation points at the kept offer";
      }
    }
    planned.push({ providerId, reservedOfferId, offers });
  }
  const totals = { groups: planned.length, keep: 0, accepted: 0, [staleOutcome]: 0 };
  planned.forEach((group) => group.offers.forEach((offer) => { totals[offer.action] += 1; }));
  return { now, staleOutcome, groups: planned, totals };
}

/** Applies a plan. Only DispatchOffer documents still in outcome "offered" are updated. */
async function applyCleanup(plan, { connection = mongoose.connection } = {}) {
  const offers = connection.db.collection("dispatchoffers");
  let modified = 0;
  for (const group of plan.groups) {
    for (const offer of group.offers) {
      if (offer.action === "keep") continue;
      const respondedAt = offer.action === "accepted" ? (offer.request?.acceptedAt || plan.now) : plan.now;
      const responseSeconds = offer.action === "accepted" && offer.offeredAt
        ? Math.max(0, (new Date(respondedAt) - new Date(offer.offeredAt)) / 1000)
        : null;
      const result = await offers.updateOne(
        { _id: offer._id, outcome: "offered" },
        { $set: { outcome: offer.action, respondedAt, responseSeconds, updatedAt: plan.now } }
      );
      modified += result.modifiedCount;
    }
  }
  return { modified };
}

function formatPlan(plan, { apply, target, indexExists }) {
  const lines = [
    `Pending-offer cleanup: ${apply ? "APPLY (writes enabled)" : "DRY RUN (no writes)"}`,
    `Target: ${target}`,
    `Index one_pending_offer_per_provider: ${indexExists ? "present" : "missing"}`,
    `Stale duplicates will be marked: ${plan.staleOutcome}`,
    `Duplicate groups (providers with more than one pending offer): ${plan.groups.length}`
  ];
  for (const group of plan.groups) {
    lines.push(`- provider ${group.providerId}: ${group.offers.length} pending offers (reservation: ${group.reservedOfferId ?? "none"})`);
    for (const offer of group.offers) {
      lines.push(`    ${offer.action.padEnd(9)} offer ${offer.offerId}  request ${offer.requestId}  offered ${new Date(offer.offeredAt).toISOString()}  - ${offer.why}`);
    }
  }
  const { groups, ...actions } = plan.totals;
  lines.push(`Summary: ${groups} group(s); ${Object.entries(actions).map(([action, count]) => `${action} ${count}`).join(", ")}.`);
  if (!apply && groups) lines.push("Nothing was written. Re-run with --apply to make these changes.");
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const errors = safetyErrors(args);
  if (errors.length) {
    errors.forEach((error) => console.error(error));
    process.exitCode = 2;
    return;
  }
  const uri = args.uri || process.env.MONGODB_URI;
  const target = describeUri(uri).display;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    // Loaded after connect so the model binds to this connection; the model file never builds the index itself.
    const { ensurePendingOfferIndex, pendingOfferIndexExists } = require("../src/services/pendingOfferIndex");
    const indexExists = await pendingOfferIndexExists();
    const plan = await planCleanup({ staleOutcome: args.staleOutcome });
    console.log(formatPlan(plan, { apply: args.apply, target, indexExists }));
    if (!args.apply) return;
    const { modified } = await applyCleanup(plan);
    console.log(`Updated ${modified} offer record(s).`);
    const after = await planCleanup({ staleOutcome: args.staleOutcome });
    console.log(`Re-check: ${after.groups.length} duplicate group(s) remain.`);
    if (args.buildIndex) {
      const result = await ensurePendingOfferIndex();
      console.log(`Index build: ${result.ok ? "ok" : `failed (${result.reason})`}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Cleanup failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { applyCleanup, describeUri, formatPlan, parseArgs, planCleanup, safetyErrors };
