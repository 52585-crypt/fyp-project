const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_WEIGHTS, getMatchingConfig } = require("../src/config/matching");
const cost = require("../src/matching/cost");

const config = getMatchingConfig({});
const now = new Date("2026-11-24T12:00:00Z");
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ""} expected ${expected}, got ${actual}`);

describe("matching config", () => {
  it("is off by default and only the literal string 'true' enables it", () => {
    assert.equal(getMatchingConfig({}).enabled, false);
    assert.equal(getMatchingConfig({ SMART_MATCHING_ENABLED: "false" }).enabled, false);
    assert.equal(getMatchingConfig({ SMART_MATCHING_ENABLED: "1" }).enabled, false);
    assert.equal(getMatchingConfig({ SMART_MATCHING_ENABLED: "TRUE" }).enabled, false);
    assert.equal(getMatchingConfig({ SMART_MATCHING_ENABLED: "true" }).enabled, true);
  });

  it("uses the agreed default weights, which sum to 1", () => {
    assert.deepEqual({ ...config.weights }, { E: 0.30, Q: 0.20, A: 0.15, S: 0.10, F: 0.10, T: 0.15 });
    close(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0), 1);
  });

  it("accepts overridden weights that sum to 1 and rejects ones that do not", () => {
    const weights = getMatchingConfig({ MATCHING_WEIGHT_E: "0.40", MATCHING_WEIGHT_Q: "0.10" }).weights;
    assert.equal(weights.E, 0.40);
    assert.equal(weights.Q, 0.10);
    assert.throws(() => getMatchingConfig({ MATCHING_WEIGHT_E: "0.5" }), /sum to 1/);
    assert.throws(() => getMatchingConfig({ MATCHING_WEIGHT_E: "-0.1" }), /MATCHING_WEIGHT_E/);
  });

  it("rejects malformed numeric settings instead of silently defaulting", () => {
    assert.throws(() => getMatchingConfig({ MATCHING_MIN_SAMPLES: "2.5" }), /MATCHING_MIN_SAMPLES/);
    assert.throws(() => getMatchingConfig({ MATCHING_MAX_ATTEMPTS: "0" }), /MATCHING_MAX_ATTEMPTS/);
    assert.throws(() => getMatchingConfig({ MATCHING_ETA_REFERENCE_SPEED_KMH: "abc" }), /MATCHING_ETA_REFERENCE_SPEED_KMH/);
    assert.equal(getMatchingConfig({}).maxAttempts, null, "max attempts is opt-in");
    assert.equal(getMatchingConfig({ MATCHING_MAX_ATTEMPTS: "" }).maxAttempts, null);
    assert.equal(getMatchingConfig({ MATCHING_MAX_ATTEMPTS: "3" }).maxAttempts, 3);
  });
});

describe("E — ETA penalty", () => {
  const etaMax = (8 / 25) * 3600; // 8 km at 25 km/h = 1152 s

  it("scales linearly to 100 at the time needed to cross the 8 km radius", () => {
    close(cost.etaPenalty(0, 8, config), 0);
    close(cost.etaPenalty(etaMax / 2, 8, config), 50);
    close(cost.etaPenalty(etaMax, 8, config), 100);
  });

  it("clamps road ETAs slower than the reference speed to 100", () => {
    close(cost.etaPenalty(etaMax * 3, 8, config), 100);
  });

  it("has no value without a usable ETA or radius", () => {
    assert.equal(cost.etaPenalty(null, 8, config), null);
    assert.equal(cost.etaPenalty(NaN, 8, config), null);
    assert.equal(cost.etaPenalty(-1, 8, config), null);
    assert.equal(cost.etaPenalty(60, 0, config), null);
  });
});

describe("Q — Bayesian rating penalty", () => {
  it("starts a provider with no reviews at the prior (4.0 → 25)", () => {
    close(cost.smoothedRating({ ratingAvg: 0, ratingCount: 0 }, config), 4);
    close(cost.qualityPenalty({ ratingAvg: 0, ratingCount: 0 }, config), 25);
    close(cost.qualityPenalty({}, config), 25);
  });

  it("shrinks a few extreme reviews toward the prior", () => {
    // one 5★ review: (5·4 + 1·5)/6 = 4.1667 → Q = 20.83
    close(cost.smoothedRating({ ratingAvg: 5, ratingCount: 1 }, config), 25 / 6);
    // one 1★ review: (5·4 + 1)/6 = 3.5 → Q = 37.5, not 100
    close(cost.qualityPenalty({ ratingAvg: 1, ratingCount: 1 }, config), 37.5);
  });

  it("approaches the true average with many reviews", () => {
    const q = cost.qualityPenalty({ ratingAvg: 5, ratingCount: 10000 }, config);
    assert.ok(q < 0.1, `got ${q}`);
    assert.ok(cost.qualityPenalty({ ratingAvg: 4.8, ratingCount: 200 }, config) < cost.qualityPenalty({ ratingAvg: 4.8, ratingCount: 2 }, config));
  });
});

describe("A — acceptance penalty", () => {
  it("is neutral below minSamples", () => {
    assert.equal(cost.acceptancePenalty({}, config), 50);
    assert.equal(cost.acceptancePenalty({ providerPerformance: { acceptedOffers: 4 } }, config), 50);
  });

  it("counts declined and ignored (expired) offers against acceptance", () => {
    close(cost.acceptancePenalty({ providerPerformance: { acceptedOffers: 5, declinedOffers: 0 } }, config), 0);
    close(cost.acceptancePenalty({ providerPerformance: { acceptedOffers: 3, declinedOffers: 1, expiredOffers: 1 } }, config), 40);
    close(cost.acceptancePenalty({ providerPerformance: { acceptedOffers: 0, expiredOffers: 6 } }, config), 100);
  });

  it("treats the expiredOffers field as 0 while it does not yet exist", () => {
    close(cost.acceptancePenalty({ providerPerformance: { acceptedOffers: 4, declinedOffers: 1 } }, config), 20);
  });
});

describe("S — response-time penalty", () => {
  it("is neutral below minSamples or without an average", () => {
    assert.equal(cost.responsePenalty({}, 20, config), 50);
    assert.equal(cost.responsePenalty({ providerPerformance: { responseSamples: 2, averageResponseSeconds: 1 } }, 20, config), 50);
    assert.equal(cost.responsePenalty({ providerPerformance: { responseSamples: 9, averageResponseSeconds: null } }, 20, config), 50);
  });

  it("is the mean response time as a share of the offer TTL, capped at 100", () => {
    close(cost.responsePenalty({ providerPerformance: { responseSamples: 5, averageResponseSeconds: 5 } }, 20, config), 25);
    close(cost.responsePenalty({ providerPerformance: { responseSamples: 5, averageResponseSeconds: 45 } }, 20, config), 100);
  });
});

describe("F — recent-workload fairness penalty", () => {
  it("is 0 when idle, 50 at the median and 100 at twice the median", () => {
    close(cost.fairnessPenalty(0, 4), 0);
    close(cost.fairnessPenalty(4, 4), 50);
    close(cost.fairnessPenalty(8, 4), 100);
    close(cost.fairnessPenalty(20, 4), 100);
  });

  it("floors the median at 1 so one recent job counts when most providers are idle", () => {
    close(cost.fairnessPenalty(1, 0), 50);
    close(cost.fairnessPenalty(2, 0), 100);
  });

  it("computes medians for odd, even and empty inputs", () => {
    assert.equal(cost.median([3, 1, 2]), 2);
    assert.equal(cost.median([4, 1, 3, 2]), 2.5);
    assert.equal(cost.median([]), 0);
  });
});

describe("T — deadline / priority term", () => {
  const at = (secondsAgo) => new Date(now.getTime() - secondsAgo * 1000);

  it("makes urgent and long-waiting requests cheaper to match", () => {
    const fresh = cost.deadlinePenalty({ priority: "normal", createdAt: at(0) }, now, 180);
    const old = cost.deadlinePenalty({ priority: "normal", createdAt: at(170) }, now, 180);
    const urgent = cost.deadlinePenalty({ priority: "urgent", createdAt: at(0) }, now, 180);
    assert.ok(old < fresh, "waiting longer must lower T");
    assert.ok(urgent < fresh, "higher priority must lower T");
  });

  it("matches the documented urgency ranges", () => {
    close(cost.urgency({ priority: "normal", createdAt: at(0) }, now, 180), 0.125);
    close(cost.urgency({ priority: "normal", createdAt: at(180) }, now, 180), 0.25);
    close(cost.urgency({ priority: "high", createdAt: at(90) }, now, 180), 0.375);
    close(cost.urgency({ priority: "urgent", createdAt: at(180) }, now, 180), 1);
    close(cost.deadlinePenalty({ priority: "urgent", createdAt: at(600) }, now, 180), 0);
  });

  it("treats an unknown priority as normal and a future createdAt as not waited", () => {
    close(cost.urgency({ priority: "bogus", createdAt: at(0) }, now, 180), 0.125);
    close(cost.urgency({ priority: "normal", createdAt: at(-60) }, now, 180), 0.125);
  });
});

describe("pairCost", () => {
  const request = { priority: "normal", createdAt: now };
  const context = {
    now, etaSeconds: 576, radiusKm: 8, offerTtlSeconds: 20, searchTimeoutSeconds: 180,
    recentAssignments: 0, medianRecentAssignments: 0
  };

  it("is the weighted sum of the six terms and stays within [0, 100]", () => {
    const result = cost.pairCost(request, {}, context, config);
    // E 50, Q 25, A 50, S 50, F 0, T 87.5
    assert.deepEqual(result.breakdown, { E: 50, Q: 25, A: 50, S: 50, F: 0, T: 87.5 });
    close(result.cost, 0.30 * 50 + 0.20 * 25 + 0.15 * 50 + 0.10 * 50 + 0.10 * 0 + 0.15 * 87.5);
    assert.deepEqual(result.weights, { ...config.weights });
  });

  it("returns no cost for a pair without a usable ETA (never a matrix cell)", () => {
    assert.equal(cost.pairCost(request, {}, { ...context, etaSeconds: undefined }, config), null);
  });

  it("does not reward lifetime completed jobs (no double counting with F)", () => {
    const veteran = cost.pairCost(request, { completedJobs: 5000 }, context, config);
    const rookie = cost.pairCost(request, { completedJobs: 0 }, context, config);
    assert.equal(veteran.cost, rookie.cost);
  });

  it("prefers the nearer of two otherwise identical providers", () => {
    const near = cost.pairCost(request, {}, { ...context, etaSeconds: 120 }, config);
    const far = cost.pairCost(request, {}, { ...context, etaSeconds: 900 }, config);
    assert.ok(near.cost < far.cost);
  });

  it("stays within [0, 100] for extreme inputs", () => {
    const worst = cost.pairCost({ priority: "normal", createdAt: now },
      { ratingAvg: 1, ratingCount: 1e6, providerPerformance: { acceptedOffers: 0, expiredOffers: 99, responseSamples: 99, averageResponseSeconds: 999 } },
      { ...context, etaSeconds: 1e6, recentAssignments: 99, medianRecentAssignments: 1 }, config);
    const best = cost.pairCost({ priority: "urgent", createdAt: new Date(now.getTime() - 1e6) },
      { ratingAvg: 5, ratingCount: 1e6, providerPerformance: { acceptedOffers: 99, responseSamples: 99, averageResponseSeconds: 0 } },
      { ...context, etaSeconds: 0 }, config);
    // T bottoms out at urgency 0.125 (a fresh normal request), so the ceiling is 85 + 0.15·87.5 = 98.125.
    assert.ok(worst.cost <= 98.125 + 1e-9 && worst.cost > 98.12, `worst ${worst.cost}`);
    close(worst.breakdown.T, 87.5);
    assert.ok(best.cost >= 0 && best.cost < 0.01, `best ${best.cost}`);
  });
});
