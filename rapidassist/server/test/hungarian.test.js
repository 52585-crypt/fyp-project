const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { assign, solveMatrix } = require("../src/matching/hungarian");
const { solveAssignment, waitingCostFor, priorityWeight } = require("../src/services/assignmentSolver");
const { getMatchingConfig } = require("../src/config/matching");
const { pairCost, unmatchedCostsFor, unmatchedBaseCostFor } = require("../src/matching/cost");

const config = getMatchingConfig({});
const EPS = 1e-6;

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Exhaustive optimum over every partial injection rows → columns (row may stay unmatched). */
function bruteForce(costs, unmatched) {
  const rows = costs.length;
  const columns = rows ? costs[0].length : 0;
  let best = Infinity;
  let bestMatched = -1;
  let bestPriority = -1;
  function visit(row, used, total, matched, priority, weights) {
    if (row === rows) {
      if (total < best) best = total;
      if (matched > bestMatched) bestMatched = matched;
      if (priority > bestPriority) bestPriority = priority;
      return;
    }
    visit(row + 1, used, total + unmatched[row], matched, priority, weights);
    for (let column = 0; column < columns; column += 1) {
      const value = costs[row][column];
      if (value == null || used & (1 << column)) continue;
      visit(row + 1, used | (1 << column), total + value, matched + 1, priority + (weights ? weights[row] : 0), weights);
    }
  }
  return {
    run(weights) {
      best = Infinity; bestMatched = -1; bestPriority = -1;
      visit(0, 0, 0, 0, 0, weights);
      return { total: best, maxMatched: bestMatched, maxPriority: bestPriority };
    }
  };
}

function assertValid(costs, solution) {
  const seen = new Set();
  solution.rowToColumn.forEach((column, row) => {
    if (column == null) return;
    assert.ok(costs[row][column] != null && Number.isFinite(costs[row][column]), `row ${row} assigned to forbidden column ${column}`);
    assert.ok(!seen.has(column), `column ${column} used twice`);
    seen.add(column);
  });
}

describe("Hungarian numeric core", () => {
  it("solves a square matrix to the known optimum", () => {
    const costs = [[4, 1, 3], [2, 0, 5], [3, 2, 2]];
    const result = solveMatrix(costs, [1000, 1000, 1000]);
    assert.deepEqual(result.rowToColumn, [1, 0, 2]);
    assert.equal(result.totalCost, 5);
    assert.equal(result.unmatchedCost, 0);
  });

  it("handles more providers than requests", () => {
    const result = solveMatrix([[9, 2, 7, 8], [6, 4, 3, 7]], [100, 100]);
    assert.deepEqual(result.rowToColumn, [1, 2]);
    assert.equal(result.totalCost, 5);
  });

  it("handles more requests than providers by leaving the costliest-to-skip row matched", () => {
    const result = solveMatrix([[5], [6], [7]], [100, 300, 200]);
    assert.deepEqual(result.rowToColumn, [null, 0, null]);
    assert.equal(result.totalCost, 6 + 100 + 200);
  });

  it("leaves every request unmatched when every pair is infeasible", () => {
    const result = solveMatrix([[null, Infinity], [NaN, null]], [10, 20]);
    assert.deepEqual(result.rowToColumn, [null, null]);
    assert.equal(result.totalCost, 30);
    assert.equal(result.assignedCost, 0);
  });

  it("never assigns a forbidden cell even when staying unmatched is very expensive", () => {
    const result = solveMatrix([[null, 1], [null, 2]], [1e9, 1e9]);
    assertValid([[null, 1], [null, 2]], result);
    assert.equal(result.rowToColumn.filter((column) => column != null).length, 1);
  });

  it("handles empty inputs and rejects malformed ones", () => {
    assert.deepEqual(solveMatrix([], []), { rowToColumn: [], totalCost: 0, assignedCost: 0, unmatchedCost: 0, unmatchedCount: 0 });
    assert.deepEqual(solveMatrix([[], []], [3, 4]).rowToColumn, [null, null]);
    assert.throws(() => solveMatrix([[1]], []), /one entry per row/);
    assert.throws(() => solveMatrix([[1, 2], [3]], [5, 5]), /columns/);
    assert.throws(() => solveMatrix([[1]], [Infinity]), /finite/);
  });

  it("matches brute force on 300 seeded random matrices up to 7×7 with forbidden cells", () => {
    const random = lcg(20261124);
    for (let scenario = 0; scenario < 300; scenario += 1) {
      const rows = 1 + Math.floor(random() * 7);
      const columns = 1 + Math.floor(random() * 7);
      const costs = Array.from({ length: rows }, () => Array.from({ length: columns }, () => (random() < 0.25 ? null : Math.round(random() * 10000) / 100)));
      const unmatched = Array.from({ length: rows }, () => Math.round(random() * 15000) / 100);
      const result = solveMatrix(costs, unmatched);
      assertValid(costs, result);
      const expected = bruteForce(costs, unmatched).run().total;
      assert.ok(Math.abs(result.totalCost - expected) < EPS, `scenario ${scenario} (${rows}×${columns}): ${result.totalCost} vs ${expected}`);
    }
  });

  it("returns a valid one-provider-per-request assignment at 200×200", () => {
    const random = lcg(7);
    const costs = Array.from({ length: 200 }, () => Array.from({ length: 200 }, () => (random() < 0.5 ? null : random() * 100)));
    const result = solveMatrix(costs, Array(200).fill(100 * 200 + 1));
    assertValid(costs, result);
  });
});

describe("cross-check against the existing min-cost-flow solver on identical cost matrices", () => {
  function scenario(random, maxRequests, maxProviders, now) {
    const requests = Array.from({ length: 1 + Math.floor(random() * maxRequests) }, (_, index) => ({
      id: `R${String(index).padStart(3, "0")}`,
      priority: ["normal", "high", "urgent"][Math.floor(random() * 3)],
      createdAt: new Date(now.getTime() - Math.floor(random() * 600) * 1000)
    }));
    const providers = Array.from({ length: 1 + Math.floor(random() * maxProviders) }, (_, index) => ({ id: `P${String(index).padStart(3, "0")}` }));
    const travelTimes = new Map();
    requests.forEach((request) => providers.forEach((provider) => {
      // Up to 4000 s so that waiting is sometimes cheaper than travel (exercises the existing "wait" edge).
      if (random() > 0.3) travelTimes.set(`${provider.id}:${request.id}`, { durationSeconds: 1 + Math.floor(random() * 4000) });
    }));
    // The existing solver's cost, expressed as a matrix: priorityWeight × max(1, round(seconds)); wait = waitingCostFor.
    const costs = requests.map((request) => providers.map((provider) => {
      const travel = travelTimes.get(`${provider.id}:${request.id}`);
      return travel ? priorityWeight(request.priority) * Math.max(1, Math.round(travel.durationSeconds)) : null;
    }));
    const unmatched = requests.map((request) => waitingCostFor(request, now));
    return { requests, providers, travelTimes, costs, unmatched };
  }

  it("Hungarian total = existing solver total = brute force for 200 seeded cases up to 7×7", () => {
    const random = lcg(424242);
    const now = new Date("2026-11-24T12:00:00Z");
    for (let index = 0; index < 200; index += 1) {
      const { requests, providers, travelTimes, costs, unmatched } = scenario(random, 7, 7, now);
      const hungarian = solveMatrix(costs, unmatched);
      const existing = solveAssignment({ requests, providers, travelTimes, now });
      const exhaustive = bruteForce(costs, unmatched).run().total;
      assert.equal(hungarian.totalCost, existing.totalCost, `case ${index}: hungarian vs existing`);
      assert.equal(hungarian.totalCost, exhaustive, `case ${index}: hungarian vs brute force`);
    }
  });

  it("Hungarian total = existing solver total for 40 seeded larger cases up to 40×40", () => {
    const random = lcg(99);
    const now = new Date("2026-11-24T12:00:00Z");
    for (let index = 0; index < 40; index += 1) {
      const { requests, providers, travelTimes, costs, unmatched } = scenario(random, 40, 40, now);
      const hungarian = solveMatrix(costs, unmatched);
      const existing = solveAssignment({ requests, providers, travelTimes, now });
      assert.equal(hungarian.totalCost, existing.totalCost, `case ${index} (${requests.length}×${providers.length})`);
    }
  });
});

describe("id-level assign() and deterministic ordering", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  const policy = (requests, providerCount) => unmatchedCostsFor(requests, providerCount, config);

  it("returns ids, costs and unmatched requests", () => {
    const result = assign({
      requests: [{ id: "r1", createdAt: now }, { id: "r2", createdAt: now }],
      providers: [{ _id: "p1" }],
      pairCost: (request) => (request.id === "r1" ? 10 : 20),
      unmatchedCosts: policy
    });
    assert.deepEqual(result.assignments, [{ requestId: "r1", providerId: "p1", cost: 10 }]);
    assert.deepEqual(result.unmatchedRequests, ["r2"]);
  });

  it("produces the same result regardless of input order when costs tie", () => {
    const requests = ["c", "a", "b"].map((id, index) => ({ id, createdAt: new Date(now.getTime() + (id === "c" ? 0 : 1000)) , index }));
    const providers = ["y", "x"].map((id) => ({ id }));
    const run = (r, p) => assign({ requests: r, providers: p, pairCost: () => 42, unmatchedCosts: policy });
    const baseline = run(requests, providers);
    const random = lcg(5);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const shuffle = (list) => list.map((item) => [random(), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
      assert.deepEqual(run(shuffle(requests), shuffle(providers)), baseline);
    }
    // Earliest request (c), then id order (a before b) gets the two providers.
    assert.deepEqual(baseline.assignments.map((item) => item.requestId).sort(), ["a", "c"]);
    assert.deepEqual(baseline.unmatchedRequests, ["b"]);
  });
});

describe("priority via unmatched cost (Option B)", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  const context = (etaSeconds) => ({
    now, etaSeconds, radiusKm: 8, offerTtlSeconds: 20, searchTimeoutSeconds: 180,
    recentAssignments: 0, medianRecentAssignments: 0
  });
  const policy = (requests, providerCount) => unmatchedCostsFor(requests, providerCount, config);
  const run = (requests, providers, etas) => assign({
    requests, providers, unmatchedCosts: policy,
    pairCost: (request, provider) => {
      const eta = etas[`${request.id}:${provider.id}`];
      return eta == null ? null : pairCost(request, provider, context(eta), config).cost;
    }
  });

  it("(a) a far urgent request beats a near normal request for one contested provider", () => {
    const result = run(
      [{ id: "near-normal", priority: "normal", createdAt: now }, { id: "far-urgent", priority: "urgent", createdAt: now }],
      [{ id: "p1", ratingAvg: 4.9, ratingCount: 50 }],
      { "near-normal:p1": 30, "far-urgent:p1": 1150 }
    );
    assert.deepEqual(result.assignments.map((item) => item.requestId), ["far-urgent"]);
    assert.deepEqual(result.unmatchedRequests, ["near-normal"]);
  });

  it("(a') a high request also beats a normal one, and urgent beats high", () => {
    const providers = [{ id: "p1" }];
    assert.deepEqual(run(
      [{ id: "n", priority: "normal", createdAt: now }, { id: "h", priority: "high", createdAt: now }],
      providers, { "n:p1": 10, "h:p1": 1100 }
    ).assignments.map((item) => item.requestId), ["h"]);
    assert.deepEqual(run(
      [{ id: "h", priority: "high", createdAt: now }, { id: "u", priority: "urgent", createdAt: now }],
      providers, { "h:p1": 10, "u:p1": 1100 }
    ).assignments.map((item) => item.requestId), ["u"]);
  });

  it("(b) with equal priority the lower-cost pair wins", () => {
    const result = run(
      [{ id: "far", priority: "high", createdAt: now }, { id: "near", priority: "high", createdAt: now }],
      [{ id: "p1" }],
      { "far:p1": 900, "near:p1": 60 }
    );
    assert.deepEqual(result.assignments.map((item) => item.requestId), ["near"]);
    assert.deepEqual(result.unmatchedRequests, ["far"]);
  });

  it("(c) a request with no eligible provider stays unmatched and is never force-assigned", () => {
    const result = run(
      [{ id: "stranded", priority: "urgent", createdAt: now }, { id: "ok", priority: "normal", createdAt: now }],
      [{ id: "p1" }, { id: "p2" }],
      { "ok:p1": 100 }
    );
    assert.deepEqual(result.assignments.map((item) => [item.requestId, item.providerId]), [["ok", "p1"]]);
    assert.deepEqual(result.unmatchedRequests, ["stranded"]);
  });

  it("a fixed U = 150 can drop a match through a reassignment chain; the per-batch floor does not", () => {
    // R1 can use P1 (0) or P2 (100); R2 can only use P1 (100).
    const costs = [[0, 100], [100, null]];
    const fixed = solveMatrix(costs, [150, 150]);
    assert.equal(fixed.rowToColumn.filter((column) => column != null).length, 1, "fixed U=150 prefers one match (150 < 200)");
    const base = unmatchedBaseCostFor(2, 2, config);
    assert.equal(base, 201);
    const floored = solveMatrix(costs, [base, base]);
    assert.deepEqual(floored.rowToColumn, [1, 0], "per-batch floor keeps both matches");
  });

  it("keeps the configured U when it already exceeds the batch bound", () => {
    assert.equal(unmatchedBaseCostFor(1, 1, config), 150);
    assert.equal(unmatchedBaseCostFor(5, 1, config), 150);
    assert.equal(unmatchedBaseCostFor(3, 3, config), 301);
    assert.equal(unmatchedBaseCostFor(3, 3, getMatchingConfig({ MATCHING_UNMATCHED_BASE_COST: "1000" })), 1000);
  });

  it("on 300 random instances the policy reaches the maximum number of matches and maximum matched priority", () => {
    const random = lcg(31337);
    const priorities = ["normal", "high", "urgent"];
    for (let index = 0; index < 300; index += 1) {
      const rows = 1 + Math.floor(random() * 6);
      const columns = 1 + Math.floor(random() * 6);
      const requests = Array.from({ length: rows }, () => ({ priority: priorities[Math.floor(random() * 3)] }));
      const costs = Array.from({ length: rows }, () => Array.from({ length: columns }, () => (random() < 0.35 ? null : random() * 100)));
      const unmatched = unmatchedCostsFor(requests, columns, config);
      const result = solveMatrix(costs, unmatched);
      assertValid(costs, result);
      const weights = requests.map((request) => config.priorityMultipliers[request.priority]);
      const best = bruteForce(costs, unmatched).run(weights);
      const matched = result.rowToColumn.filter((column) => column != null).length;
      const matchedPriority = result.rowToColumn.reduce((sum, column, row) => sum + (column == null ? 0 : weights[row]), 0);
      assert.equal(matched, best.maxMatched, `case ${index}: matches`);
      assert.equal(matchedPriority, best.maxPriority, `case ${index}: matched priority`);
      assert.ok(Math.abs(result.totalCost - best.total) < EPS, `case ${index}: optimum`);
    }
  });
});

describe("priority config validation", () => {
  it("defaults to 1 / 2 / 4 and U = 150", () => {
    assert.deepEqual({ ...config.priorityMultipliers }, { normal: 1, high: 2, urgent: 4 });
    assert.equal(config.unmatchedBaseCost, 150);
  });

  it("rejects U ≤ 100, non-integer multipliers and non-monotone multipliers", () => {
    assert.throws(() => getMatchingConfig({ MATCHING_UNMATCHED_BASE_COST: "100" }), /MATCHING_UNMATCHED_BASE_COST/);
    assert.throws(() => getMatchingConfig({ MATCHING_PRIORITY_MULTIPLIER_HIGH: "1.5" }), /MATCHING_PRIORITY_MULTIPLIER_HIGH/);
    assert.throws(() => getMatchingConfig({ MATCHING_PRIORITY_MULTIPLIER_URGENT: "1" }), /normal ≤ high ≤ urgent/);
  });
});
