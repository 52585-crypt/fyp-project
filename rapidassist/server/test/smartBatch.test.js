const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { COST_SCALE, LIMITS, SAFETY_FACTOR, getMatchingConfig, numericBound } = require("../src/config/matching");
const { planSmartBatch } = require("../src/matching/smartBatch");

const now = new Date("2026-11-24T12:00:00Z");
const categoryFor = (category) => (category === "car_towing" ? "towing" : category);
const timings = { offerTtlSeconds: 20, searchTimeoutSeconds: 180 };

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** requests × providers in one category; `eligible(r, p)` decides whether a pair exists. */
function batch({ requestCount, providerCount, category = "mechanic", eligible = () => true, eta = () => 300, priority = () => "normal" }) {
  const requests = Array.from({ length: requestCount }, (_, index) => ({
    id: `r${String(index).padStart(4, "0")}`, category, priority: priority(index),
    createdAt: new Date(+now - index * 1000), dispatch: { radiusKm: 8 }
  }));
  const providers = Array.from({ length: providerCount }, (_, index) => ({
    id: `p${String(index).padStart(4, "0")}`, mechanicProfile: { serviceCategory: categoryFor(category) }, ratingAvg: 4.5, ratingCount: 10
  }));
  const pairs = new Map();
  const travelTimes = new Map();
  requests.forEach((request, r) => providers.forEach((provider, p) => {
    if (!eligible(r, p)) return;
    const key = `${provider.id}:${request.id}`;
    pairs.set(key, { request, provider, directDistanceKm: 1 });
    travelTimes.set(key, { durationSeconds: eta(r, p), source: "haversine_fallback" });
  }));
  return { requests, providers, pairs, travelTimes };
}

function assertValidPlan(plan) {
  const providers = new Set();
  for (const assignment of plan.assignments) {
    assert.ok(!providers.has(assignment.provider.id), `provider ${assignment.provider.id} assigned twice`);
    providers.add(assignment.provider.id);
    assert.ok(assignment.pairCost >= 0 && assignment.pairCost <= 100, `real pair cost ${assignment.pairCost}`);
    assert.equal(categoryFor(assignment.request.category), assignment.provider.mechanicProfile.serviceCategory);
  }
  const sum = plan.assignments.reduce((total, item) => total + item.pairCost, 0);
  assert.ok(Math.abs(plan.assignedCost - sum) < 1e-9, "assignedCost is the sum of real pair costs only");
}

describe("numeric safety", () => {
  it("keeps the default configuration's worst case far inside Number.MAX_SAFE_INTEGER", () => {
    const config = getMatchingConfig({});
    const bound = numericBound(config);
    // R = P = 300, urgent ×4: cell = ceil(max(150, 100·300 + 1) · 1000) · 4
    assert.equal(bound.largestCell, 30001 * COST_SCALE * 4);
    assert.equal(bound.objectiveBound, (300 + 300 + 1) * 30001 * COST_SCALE * 4);
    assert.ok(Number.isSafeInteger(bound.objectiveBound));
    assert.ok(bound.objectiveBound <= Number.MAX_SAFE_INTEGER / SAFETY_FACTOR);
    assert.ok(Number.MAX_SAFE_INTEGER / bound.objectiveBound > 100000, `headroom ${Number.MAX_SAFE_INTEGER / bound.objectiveBound}`);
  });

  it("keeps the most extreme configuration the limits allow within the safety margin", () => {
    const config = getMatchingConfig({
      MATCHING_UNMATCHED_BASE_COST: String(LIMITS.maxUnmatchedBaseCost),
      MATCHING_PRIORITY_MULTIPLIER_HIGH: String(LIMITS.maxPriorityMultiplier),
      MATCHING_PRIORITY_MULTIPLIER_URGENT: String(LIMITS.maxPriorityMultiplier),
      MATCHING_MAX_BATCH_SIZE: String(LIMITS.maxBatchSize)
    });
    const bound = numericBound(config);
    assert.ok(Number.isSafeInteger(bound.objectiveBound));
    assert.ok(bound.objectiveBound <= bound.limit, `${bound.objectiveBound} > ${bound.limit}`);
  });

  it("rejects settings beyond the limits", () => {
    assert.throws(() => getMatchingConfig({ MATCHING_MAX_BATCH_SIZE: String(LIMITS.maxBatchSize + 1) }), /MATCHING_MAX_BATCH_SIZE/);
    assert.throws(() => getMatchingConfig({ MATCHING_UNMATCHED_BASE_COST: "10001" }), /MATCHING_UNMATCHED_BASE_COST/);
    assert.throws(() => getMatchingConfig({ MATCHING_PRIORITY_MULTIPLIER_URGENT: "101" }), /MATCHING_PRIORITY_MULTIPLIER_URGENT/);
  });

  it("solves a full batch at the configured maximum size (300 × 300) with a valid, maximum plan", () => {
    const config = getMatchingConfig({});
    const random = lcg(2026);
    const etas = Array.from({ length: 300 }, () => Array.from({ length: 300 }, () => 60 + Math.floor(random() * 1000)));
    const input = batch({
      requestCount: config.maxBatchSize,
      providerCount: config.maxBatchSize,
      eta: (r, p) => etas[r][p],
      priority: (index) => ["normal", "high", "urgent"][index % 3]
    });
    const plan = planSmartBatch({ ...input, now, config, categoryFor, ...timings });
    assertValidPlan(plan);
    assert.equal(plan.assignments.length, 300, "every request matched when every pair is eligible");
    assert.equal(plan.unmatchedCount, 0);
    const [summary] = plan.categories;
    assert.equal(summary.requests, 300);
    assert.equal(summary.unmatchedBaseCost, 30001);
    assert.ok(Number.isSafeInteger(summary.largestSolverValue));
    assert.ok(summary.largestSolverValue <= Number.MAX_SAFE_INTEGER / SAFETY_FACTOR);
  });
});

describe("planSmartBatch", () => {
  const config = getMatchingConfig({});

  it("solves categories separately and maps car_towing to towing providers", () => {
    const mech = batch({ requestCount: 2, providerCount: 2, category: "mechanic" });
    const tow = batch({ requestCount: 1, providerCount: 1, category: "car_towing" });
    tow.requests[0].id = "tow-request";
    tow.providers[0].id = "tow-provider";
    const pairs = new Map([...mech.pairs, ["tow-provider:tow-request", { request: tow.requests[0], provider: tow.providers[0] }]]);
    const travelTimes = new Map([...mech.travelTimes, ["tow-provider:tow-request", { durationSeconds: 200 }]]);
    const plan = planSmartBatch({
      requests: [...mech.requests, ...tow.requests], providers: [...mech.providers, ...tow.providers],
      pairs, travelTimes, now, config, categoryFor, ...timings
    });
    assertValidPlan(plan);
    assert.deepEqual(plan.categories.map((item) => [item.category, item.requests, item.providers, item.matched]), [["mechanic", 2, 2, 2], ["towing", 1, 1, 1]]);
  });

  it("ignores pairs without a travel time and never assigns them", () => {
    const input = batch({ requestCount: 2, providerCount: 1 });
    input.travelTimes.delete("p0000:r0000");
    const plan = planSmartBatch({ ...input, now, config, categoryFor, ...timings });
    assert.deepEqual(plan.assignments.map((item) => item.request.id), ["r0001"]);
    assert.deepEqual(plan.unmatchedRequestIds, ["r0000"]);
  });

  it("admits the highest-priority, then oldest, requests when over the batch cap", () => {
    const capped = getMatchingConfig({ MATCHING_MAX_BATCH_SIZE: "2" });
    const input = batch({ requestCount: 3, providerCount: 3, priority: (index) => ["normal", "urgent", "high"][index] });
    const plan = planSmartBatch({ ...input, now, config: capped, categoryFor, ...timings });
    assert.deepEqual(plan.assignments.map((item) => item.request.priority).sort(), ["high", "urgent"]);
    assert.deepEqual(plan.unmatchedRequestIds, ["r0000"]);
    assert.equal(plan.categories[0].deferredCount, 1);
    assert.equal(plan.unmatchedCount, 1);
  });

  it("keeps the providers with the shortest best ETA when over the batch cap", () => {
    const capped = getMatchingConfig({ MATCHING_MAX_BATCH_SIZE: "2" });
    const input = batch({ requestCount: 1, providerCount: 3, eta: (_, p) => [900, 100, 200][p] });
    const plan = planSmartBatch({ ...input, now, config: capped, categoryFor, ...timings });
    assert.equal(plan.categories[0].providers, 2);
    assert.equal(plan.assignments[0].provider.id, "p0001");
  });

  it("uses recent workload for fairness: an idle provider beats an equally placed busy one", () => {
    const input = batch({ requestCount: 1, providerCount: 2 });
    const workload = new Map([["p0000", 6], ["p0001", 0]]);
    const plan = planSmartBatch({ ...input, workload, now, config, categoryFor, ...timings });
    assert.equal(plan.assignments[0].provider.id, "p0001");
    assert.equal(plan.assignments[0].breakdown.F, 0);
  });

  it("returns real pair costs only, with unmatched requests counted rather than priced", () => {
    const input = batch({ requestCount: 3, providerCount: 1 });
    const plan = planSmartBatch({ ...input, now, config, categoryFor, ...timings });
    assertValidPlan(plan);
    assert.equal(plan.unmatchedCount, 2);
    assert.ok(plan.assignedCost <= 100, `assignedCost ${plan.assignedCost} must exclude unmatched penalties`);
  });
});
