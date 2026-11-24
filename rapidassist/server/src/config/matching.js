// Smart matching configuration. Read on every call (not cached) so tests and operators can toggle it
// without a restart. Everything here is inert unless SMART_MATCHING_ENABLED === "true".

const DEFAULT_WEIGHTS = Object.freeze({ E: 0.30, Q: 0.20, A: 0.15, S: 0.10, F: 0.10, T: 0.15 });
const TERMS = Object.keys(DEFAULT_WEIGHTS);

const DEFAULTS = Object.freeze({
  // ETA normalisation: etaMax = radiusKm / referenceSpeedKmh. 25 km/h matches the Haversine fallback in
  // services/travelTimeMatrix.js, so a provider exactly at the radius edge scores E = 100 on the fallback.
  etaReferenceSpeedKmh: 25,
  // Bayesian rating prior: same values as the existing explainability score (services/dispatch.js scoreBreakdown).
  ratingPriorMean: 4.0,
  ratingPriorWeight: 5,
  // A and S use the neutral value until a provider has this many offer outcomes.
  minSamples: 5,
  neutralPenalty: 50,
  // F: assignments counted over this trailing window.
  fairnessWindowHours: 8,
  // Opt-in: when set, a request goes "unavailable" after this many distinct offers. Off (null) by default so a
  // search never ends earlier than the existing 180 s timeout; loops are already impossible (each provider is
  // offered a request at most once, and the timeout ends every search).
  maxAttempts: null,
  // Hungarian dummy (unmatched) cost per request = U_batch × priorityMultiplier. U must exceed the largest real
  // pair cost (100). It is a floor: matching/cost.js raises it per batch to guarantee maximum matches.
  unmatchedBaseCost: 150,
  priorityMultipliers: Object.freeze({ normal: 1, high: 2, urgent: 4 }),
  // Per category, at most this many requests and this many providers enter one Hungarian solve.
  maxBatchSize: 300
});

// Hard caps that bound every number the solver can see (see numericBound / 04-hungarian.md §6).
const LIMITS = Object.freeze({ maxUnmatchedBaseCost: 1e4, maxPriorityMultiplier: 100, maxBatchSize: 1000 });
// Real pair costs (0–100) are quantised to integer milli-units before solving, so all solver arithmetic is exact.
const COST_SCALE = 1000;
const MAX_PAIR_COST = 100;
// Required headroom: the worst-case objective must stay below MAX_SAFE_INTEGER / SAFETY_FACTOR.
const SAFETY_FACTOR = 256;

function readPriorityMultipliers(env) {
  const multipliers = {};
  for (const priority of ["normal", "high", "urgent"]) {
    multipliers[priority] = envNumber(env, `MATCHING_PRIORITY_MULTIPLIER_${priority.toUpperCase()}`, DEFAULTS.priorityMultipliers[priority], { min: 1, max: LIMITS.maxPriorityMultiplier, integer: true });
  }
  // Integers keep the lexicographic guarantee exact (any change in matched priority is ≥ 1 unit).
  if (!(multipliers.normal <= multipliers.high && multipliers.high <= multipliers.urgent)) {
    throw new Error("MATCHING_PRIORITY_MULTIPLIER_* must satisfy normal ≤ high ≤ urgent");
  }
  return Object.freeze(multipliers);
}

function envNumber(env, key, fallback, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const raw = env[key];
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`Invalid ${key}: ${raw}`);
  }
  return value;
}

function readWeights(env) {
  const weights = {};
  for (const term of TERMS) {
    weights[term] = envNumber(env, `MATCHING_WEIGHT_${term}`, DEFAULT_WEIGHTS[term], { min: 0, max: 1 });
  }
  const sum = TERMS.reduce((total, term) => total + weights[term], 0);
  if (Math.abs(sum - 1) > 1e-6) throw new Error(`MATCHING_WEIGHT_* must sum to 1 (got ${sum.toFixed(6)})`);
  return Object.freeze(weights);
}

/** Smart matching settings from `env`. Throws on a malformed value instead of silently using a default. */
function getMatchingConfig(env = process.env) {
  const config = Object.freeze({
    enabled: env.SMART_MATCHING_ENABLED === "true",
    weights: readWeights(env),
    etaReferenceSpeedKmh: envNumber(env, "MATCHING_ETA_REFERENCE_SPEED_KMH", DEFAULTS.etaReferenceSpeedKmh, { min: 1, max: 200 }),
    ratingPriorMean: envNumber(env, "MATCHING_RATING_PRIOR_MEAN", DEFAULTS.ratingPriorMean, { min: 1, max: 5 }),
    ratingPriorWeight: envNumber(env, "MATCHING_RATING_PRIOR_WEIGHT", DEFAULTS.ratingPriorWeight, { min: 0, max: 1000 }),
    minSamples: envNumber(env, "MATCHING_MIN_SAMPLES", DEFAULTS.minSamples, { min: 1, max: 10000, integer: true }),
    neutralPenalty: envNumber(env, "MATCHING_NEUTRAL_PENALTY", DEFAULTS.neutralPenalty, { min: 0, max: 100 }),
    fairnessWindowHours: envNumber(env, "MATCHING_FAIRNESS_WINDOW_HOURS", DEFAULTS.fairnessWindowHours, { min: 0.25, max: 24 * 30 }),
    maxAttempts: envNumber(env, "MATCHING_MAX_ATTEMPTS", DEFAULTS.maxAttempts, { min: 1, max: 100, integer: true }),
    // Strictly greater than the maximum real pair cost (100).
    unmatchedBaseCost: envNumber(env, "MATCHING_UNMATCHED_BASE_COST", DEFAULTS.unmatchedBaseCost, { min: 100.000001, max: LIMITS.maxUnmatchedBaseCost }),
    priorityMultipliers: readPriorityMultipliers(env),
    maxBatchSize: envNumber(env, "MATCHING_MAX_BATCH_SIZE", DEFAULTS.maxBatchSize, { min: 1, max: LIMITS.maxBatchSize, integer: true })
  });
  assertNumericSafety(config);
  return config;
}

/** Cheap flag check that never parses (or throws on) the rest of the matching config. */
function isSmartMatchingEnabled(env = process.env) {
  return env.SMART_MATCHING_ENABLED === "true";
}

/** Per-batch U in cost units: the configured U is a floor, raised to 100·min(R,P) + 1 (see 04-hungarian.md §4). */
function unmatchedBaseCostFor(requestCount, providerCount, config) {
  const pairs = Math.max(0, Math.min(requestCount, providerCount));
  return Math.max(config.unmatchedBaseCost, MAX_PAIR_COST * pairs + 1);
}

/** Largest scaled unmatched cell for a batch, in solver units (integers). */
function scaledUnmatchedCell(requestCount, providerCount, multiplier, config) {
  return Math.ceil(unmatchedBaseCostFor(requestCount, providerCount, config) * COST_SCALE) * multiplier;
}

/**
 * Worst case over every batch the config allows (R = P = maxBatchSize, urgent multiplier):
 * largest matrix cell, and an upper bound on any objective / dual-potential magnitude, (R + P + 1) × largest cell.
 */
function numericBound(config, requestCount = config.maxBatchSize, providerCount = config.maxBatchSize) {
  const largestCell = scaledUnmatchedCell(requestCount, providerCount, config.priorityMultipliers.urgent, config);
  const objectiveBound = (requestCount + providerCount + 1) * largestCell;
  return { largestCell, objectiveBound, limit: Number.MAX_SAFE_INTEGER / SAFETY_FACTOR };
}

function assertNumericSafety(config, requestCount, providerCount) {
  const bound = numericBound(config, requestCount, providerCount);
  if (!(bound.objectiveBound <= bound.limit)) {
    throw new Error(`Smart matching numbers unsafe: bound ${bound.objectiveBound} exceeds ${bound.limit}`);
  }
  return bound;
}

module.exports = {
  COST_SCALE,
  DEFAULT_WEIGHTS,
  DEFAULTS,
  LIMITS,
  MAX_PAIR_COST,
  SAFETY_FACTOR,
  TERMS,
  assertNumericSafety,
  getMatchingConfig,
  isSmartMatchingEnabled,
  numericBound,
  scaledUnmatchedCell,
  unmatchedBaseCostFor
};
