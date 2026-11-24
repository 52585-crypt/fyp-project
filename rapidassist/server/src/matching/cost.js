// Multi-objective assignment cost for one (request, provider) pair. Pure: no DB, no clock reads, no I/O.
// Every term is a penalty in [0, 100]; lower is better. C = Σ w_k · term_k, so C ∈ [0, 100].
// Eligibility (category, radius, online, busy, reserved, stale location, already offered) is decided by
// services/dispatch.js before a pair reaches this module. A pair without a usable ETA has no cost (null),
// so it can never become a cell in the assignment matrix.

const { PRIORITY_WEIGHTS, priorityWeight } = require("../services/assignmentSolver");
const { MAX_PAIR_COST, TERMS, unmatchedBaseCostFor } = require("../config/matching");

const MAX_PRIORITY_WEIGHT = Math.max(...Object.values(PRIORITY_WEIGHTS));
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const count = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

/** E: travel time relative to the time needed to cross the dispatch radius at the reference speed. */
function etaPenalty(etaSeconds, radiusKm, config) {
  if (!Number.isFinite(etaSeconds) || etaSeconds < 0) return null;
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) return null;
  const etaMaxSeconds = (radiusKm / config.etaReferenceSpeedKmh) * 3600;
  return (100 * Math.min(etaSeconds, etaMaxSeconds)) / etaMaxSeconds;
}

/** Bayesian-smoothed rating r̂ = (C·m + n·avg)/(C + n). With no reviews r̂ = m. */
function smoothedRating(provider, config) {
  const n = count(provider?.ratingCount);
  const avg = clamp(Number(provider?.ratingAvg) || 0, 0, 5);
  const C = config.ratingPriorWeight;
  if (C + n === 0) return config.ratingPriorMean;
  return (C * config.ratingPriorMean + n * avg) / (C + n);
}

/** Q: 0 for a smoothed 5★, 100 for a smoothed 1★. */
function qualityPenalty(provider, config) {
  return clamp((100 * (5 - smoothedRating(provider, config))) / 4, 0, 100);
}

/**
 * A: share of offers the provider did not accept. Ignored (expired) offers count against acceptance;
 * `expiredOffers` is absent until Phase 5 adds it and is then treated as 0. Neutral below minSamples.
 */
function acceptancePenalty(provider, config) {
  const performance = provider?.providerPerformance || {};
  const accepted = count(performance.acceptedOffers);
  const samples = accepted + count(performance.declinedOffers) + count(performance.expiredOffers);
  if (samples < config.minSamples) return config.neutralPenalty;
  return 100 * (1 - accepted / samples);
}

/**
 * S: mean response time of answered offers (accepted or declined) as a share of the offer TTL.
 * Ignored offers are not included here; they already cost the provider through A (no double counting).
 */
function responsePenalty(provider, offerTtlSeconds, config) {
  const performance = provider?.providerPerformance || {};
  const average = performance.averageResponseSeconds;
  if (count(performance.responseSamples) < config.minSamples || !Number.isFinite(average)) return config.neutralPenalty;
  if (!Number.isFinite(offerTtlSeconds) || offerTtlSeconds <= 0) return config.neutralPenalty;
  return (100 * clamp(average, 0, offerTtlSeconds)) / offerTtlSeconds;
}

/**
 * F: recent workload relative to the median of the batch's eligible providers.
 * 0 jobs → 0; at the median → 50; at twice the median (or more) → 100. The median is floored at 1 so that
 * when most providers are idle, a single recent job already costs 50.
 */
function fairnessPenalty(recentAssignments, medianRecentAssignments) {
  const own = count(recentAssignments);
  const median = Math.max(1, count(medianRecentAssignments));
  return 100 * Math.min(1, own / (2 * median));
}

/**
 * Urgency u ∈ [0, 1] from request priority and time waited:
 * u = (priorityWeight / maxPriorityWeight) · (0.5 + 0.5 · min(1, waited / searchTimeout)).
 * normal 0.125→0.25, high 0.25→0.5, urgent 0.5→1.
 */
function urgency(request, now, searchTimeoutSeconds) {
  const createdAt = new Date(request?.createdAt ?? now).getTime();
  const waitedSeconds = Number.isFinite(createdAt) ? Math.max(0, (now.getTime() - createdAt) / 1000) : 0;
  const waitedShare = searchTimeoutSeconds > 0 ? Math.min(1, waitedSeconds / searchTimeoutSeconds) : 1;
  return clamp((priorityWeight(request?.priority) / MAX_PRIORITY_WEIGHT) * (0.5 + 0.5 * waitedShare), 0, 1);
}

/**
 * T: 100 · (1 − u). Deliberately *lower* for urgent / long-waiting requests: in an assignment that maximises
 * matches first and then minimises total cost, a cheaper row wins a scarce provider. A penalty that grew
 * with waiting time would do the opposite and push old or urgent requests to the back.
 */
function deadlinePenalty(request, now, searchTimeoutSeconds) {
  return 100 * (1 - urgency(request, now, searchTimeoutSeconds));
}

/** Middle value (mean of the two middle values for an even count). Empty input → 0. */
function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Cost of offering `request` to `provider`.
 * context: { now: Date, etaSeconds, radiusKm, offerTtlSeconds, searchTimeoutSeconds,
 *            recentAssignments, medianRecentAssignments }
 * Returns { cost, breakdown: {E,Q,A,S,F,T}, weights } or null when the pair has no usable ETA.
 */
function pairCost(request, provider, context, config) {
  const E = etaPenalty(context.etaSeconds, context.radiusKm, config);
  if (E == null) return null;
  const breakdown = {
    E,
    Q: qualityPenalty(provider, config),
    A: acceptancePenalty(provider, config),
    S: responsePenalty(provider, context.offerTtlSeconds, config),
    F: fairnessPenalty(context.recentAssignments, context.medianRecentAssignments),
    T: deadlinePenalty(request, context.now, context.searchTimeoutSeconds)
  };
  const cost = TERMS.reduce((total, term) => total + config.weights[term] * breakdown[term], 0);
  return { cost, breakdown, weights: { ...config.weights } };
}

// U_batch = max(U, MAX_PAIR_COST·min(R,P) + 1) lives in config/matching.js (unmatchedBaseCostFor) so the solver
// policy and the numeric-safety bound share one definition. Why the floor exists: 04-hungarian.md §4.

/** Dummy-column cost per request, in input order: U_batch × priorityMultiplier(priority). */
function unmatchedCostsFor(requests, providerCount, config) {
  const base = unmatchedBaseCostFor(requests.length, providerCount, config);
  return requests.map((request) => base * (config.priorityMultipliers[request?.priority] ?? config.priorityMultipliers.normal));
}

module.exports = {
  MAX_PAIR_COST,
  unmatchedBaseCostFor,
  unmatchedCostsFor,
  acceptancePenalty,
  deadlinePenalty,
  etaPenalty,
  fairnessPenalty,
  median,
  pairCost,
  qualityPenalty,
  responsePenalty,
  smoothedRating,
  urgency
};
