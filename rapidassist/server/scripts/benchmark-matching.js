#!/usr/bin/env node
// Smart-matching benchmark: four assignment approaches on identical, seeded, synthetic inputs. No DB, no network.
//
//   npm run benchmark:matching                 full run, writes docs/smart-matching/benchmark-results/
//   node scripts/benchmark-matching.js --quick --out=<dir>   tiny smoke run (used by the test suite)
//
// Approaches (all see the same eligible pairs: same service category, straight-line distance ≤ 8 km):
//   a) nearest-first  : requests in arrival order, each takes the free provider with the shortest ETA
//   b) greedy-cost    : repeatedly take the globally cheapest remaining pair under the NEW multi-objective cost
//   c) existing-mcf   : services/assignmentSolver.js (min-cost flow) with its own cost (priority × travel seconds)
//   d) smart-hungarian: matching/smartBatch.js (Hungarian, new cost, priority-weighted unmatched cost), as in production
//
// ETA: services/travelTimeMatrix.js fallbackBlock (straight line at 25 km/h, 60 s floor) for every approach.
// OSRM is deliberately excluded: it is a network service whose answers and latency vary between runs.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fallbackBlock } = require("../src/services/travelTimeMatrix");
const { solveAssignment } = require("../src/services/assignmentSolver");
const { getMatchingConfig } = require("../src/config/matching");
const { pairCost, median } = require("../src/matching/cost");
const { planSmartBatch } = require("../src/matching/smartBatch");

const args = process.argv.slice(2);
const QUICK = args.includes("--quick");
const ONLY = args.find((arg) => arg.startsWith("--only="))?.slice(7) || null; // "sensitivity": skip the main benchmark
const OUT_DIR = path.resolve(args.find((arg) => arg.startsWith("--out="))?.slice(6) || path.join(__dirname, "..", "..", "docs", "smart-matching", "benchmark-results"));

const CONFIG = getMatchingConfig({}); // production defaults: weights .30/.20/.15/.10/.10/.15, U 150, ×1/2/4
const RADIUS_KM = 8;
const OFFER_TTL_SECONDS = 20;
const SEARCH_TIMEOUT_SECONDS = 180;
const CENTER = { lat: 31.52, lng: 74.35 };
const KM_PER_DEG = 6371 * (Math.PI / 180);
const PRIORITIES = ["normal", "high", "urgent"];
const categoryFor = (category) => (category === "car_towing" ? "towing" : category);
const APPROACHES = ["nearest-first", "greedy-cost", "existing-mcf", "smart-hungarian"];

// ---------------------------------------------------------------- deterministic helpers
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
const unitHash = (...parts) => mulberry32(hashString(parts.join("|")))();
function gaussian(random) {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}
const offset = (northKm, eastKm) => ({
  lat: CENTER.lat + northKm / KM_PER_DEG,
  lng: CENTER.lng + eastKm / (KM_PER_DEG * Math.cos((CENTER.lat * Math.PI) / 180))
});
function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
const pick = (random, weights) => {
  let roll = random() * weights.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [value, weight] of weights) { roll -= weight; if (roll <= 0) return value; }
  return weights[weights.length - 1][0];
};
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
};
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const stdDev = (values) => {
  const m = mean(values);
  return values.length ? Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / values.length) : null;
};
function gini(values) {
  const n = values.length;
  const total = values.reduce((a, b) => a + b, 0);
  if (!n || !total) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const weighted = sorted.reduce((sum, value, index) => sum + (index + 1) * value, 0);
  return (2 * weighted) / (n * total) - (n + 1) / n;
}
const round = (value, digits = 2) => (value == null ? null : Math.round(value * 10 ** digits) / 10 ** digits);

// ---------------------------------------------------------------- synthetic world
function locationSampler(random, geo) {
  if (geo === "uniform") return () => offset((random() - 0.5) * 20, (random() - 0.5) * 20);
  const centers = Array.from({ length: 5 }, () => [(random() - 0.5) * 14, (random() - 0.5) * 14]);
  return () => {
    const [north, east] = centers[Math.floor(random() * centers.length)];
    return offset(north + gaussian(random) * 2, east + gaussian(random) * 2);
  };
}

function makeProvider(random, index, category, location) {
  const ratingCount = Math.floor(random() ** 2 * 150);
  const coldStart = random() < 0.3;
  const propensity = 0.55 + random() * 0.43; // probability of accepting an offer (used by the simulation)
  const offers = coldStart ? 0 : 5 + Math.floor(random() * 60);
  const accepted = Math.round(offers * propensity);
  const declined = Math.round((offers - accepted) * 0.6);
  return {
    id: `p${String(index).padStart(4, "0")}`,
    mechanicProfile: { serviceCategory: category },
    ratingAvg: ratingCount ? Math.min(5, Math.max(1, 4.3 + gaussian(random) * 0.4)) : 0,
    ratingCount,
    providerPerformance: {
      acceptedOffers: accepted,
      declinedOffers: declined,
      expiredOffers: offers - accepted - declined,
      responseSamples: accepted + declined,
      averageResponseSeconds: accepted + declined ? 3 + random() * 15 : null
    },
    providerState: { currentLocation: location },
    propensity
  };
}

function makeRequest(random, index, category, location, priority, createdAt) {
  return { id: `r${String(index).padStart(4, "0")}`, category, priority, createdAt, pickupLocation: location, dispatch: { radiusKm: RADIUS_KM } };
}

const PRIORITY_MIX = { default: [["normal", 0.80], ["high", 0.15], ["urgent", 0.05]], mixed: [["normal", 0.50], ["high", 0.25], ["urgent", 0.25]] };
const CATEGORY_MIX = { single: [["mechanic", 1]], mixed: [["mechanic", 0.40], ["fuel_delivery", 0.35], ["car_towing", 0.25]] };

function generateBatch({ seed, requests: requestCount, providers: providerCount, geo, priorityMix, categoryMix }, now) {
  const random = mulberry32(seed);
  const where = locationSampler(random, geo);
  const providers = Array.from({ length: providerCount }, (_, index) => makeProvider(random, index, categoryFor(pick(random, CATEGORY_MIX[categoryMix])), where()));
  const requests = Array.from({ length: requestCount }, (_, index) => makeRequest(
    random, index, pick(random, CATEGORY_MIX[categoryMix]), where(), pick(random, PRIORITY_MIX[priorityMix]),
    new Date(+now - Math.floor(random() * 150) * 1000)
  ));
  const workload = new Map(providers.map((provider) => [provider.id, Math.floor(random() * 7)]));
  return { requests, providers, workload };
}

/** Eligible pairs exactly as the dispatcher builds them (category + 8 km straight line) and their ETAs. */
function eligibility(requests, providers) {
  const travel = fallbackBlock(providers, requests);
  const pairs = new Map();
  const travelTimes = new Map();
  for (const request of requests) {
    for (const provider of providers) {
      if (provider.mechanicProfile.serviceCategory !== categoryFor(request.category)) continue;
      const km = haversineKm(request.pickupLocation, provider.providerState.currentLocation);
      if (km > RADIUS_KM) continue;
      const key = `${provider.id}:${request.id}`;
      pairs.set(key, { request, provider, directDistanceKm: km });
      travelTimes.set(key, travel.get(key));
    }
  }
  return { pairs, travelTimes };
}

/** New-cost evaluator with the same per-category workload median smartBatch uses (providers with ≥ 1 usable pair). */
function costModel(requests, providers, pairs, travelTimes, workload, now) {
  const medians = new Map();
  for (const category of new Set(requests.map((request) => categoryFor(request.category)))) {
    const usable = providers.filter((provider) => provider.mechanicProfile.serviceCategory === category
      && requests.some((request) => pairs.has(`${provider.id}:${request.id}`)));
    medians.set(category, median(usable.map((provider) => workload.get(provider.id) || 0)));
  }
  const cache = new Map();
  return (request, provider) => {
    const key = `${provider.id}:${request.id}`;
    if (!pairs.has(key)) return null;
    if (!cache.has(key)) {
      cache.set(key, pairCost(request, provider, {
        now, etaSeconds: travelTimes.get(key).durationSeconds, radiusKm: RADIUS_KM,
        offerTtlSeconds: OFFER_TTL_SECONDS, searchTimeoutSeconds: SEARCH_TIMEOUT_SECONDS,
        recentAssignments: workload.get(provider.id) || 0, medianRecentAssignments: medians.get(categoryFor(request.category))
      }, CONFIG));
    }
    return cache.get(key);
  };
}

// ---------------------------------------------------------------- the four approaches → [{requestId, providerId}]
const byArrival = (a, b) => +a.createdAt - +b.createdAt || (a.id < b.id ? -1 : 1);

const APPROACH_FNS = {
  "nearest-first"({ requests, providers, travelTimes, pairs }) {
    const taken = new Set();
    const result = [];
    for (const request of [...requests].sort(byArrival)) {
      let best = null;
      for (const provider of providers) {
        const key = `${provider.id}:${request.id}`;
        if (taken.has(provider.id) || !pairs.has(key)) continue;
        const eta = travelTimes.get(key).durationSeconds;
        if (!best || eta < best.eta || (eta === best.eta && provider.id < best.id)) best = { id: provider.id, eta };
      }
      if (best) { taken.add(best.id); result.push({ requestId: request.id, providerId: best.id }); }
    }
    return result;
  },
  "greedy-cost"({ requests, providers, pairs, travelTimes, workload, now }) {
    const price = costModel(requests, providers, pairs, travelTimes, workload, now);
    const candidates = [];
    for (const { request, provider } of pairs.values()) candidates.push({ request, provider, cost: price(request, provider).cost });
    candidates.sort((a, b) => a.cost - b.cost || (a.request.id < b.request.id ? -1 : a.request.id > b.request.id ? 1 : a.provider.id < b.provider.id ? -1 : 1));
    const usedRequests = new Set();
    const usedProviders = new Set();
    const result = [];
    for (const { request, provider } of candidates) {
      if (usedRequests.has(request.id) || usedProviders.has(provider.id)) continue;
      usedRequests.add(request.id); usedProviders.add(provider.id);
      result.push({ requestId: request.id, providerId: provider.id });
    }
    return result;
  },
  "existing-mcf"({ requests, providers, travelTimes, now }) {
    return solveAssignment({ requests, providers, travelTimes, now }).assignments
      .map(({ requestId, providerId }) => ({ requestId, providerId }));
  },
  "smart-hungarian": smartWith(CONFIG)
};

/** Approach (d) with an arbitrary matching config (used by the weight-sensitivity run). */
function smartWith(config) {
  return ({ requests, providers, pairs, travelTimes, workload, now }) => planSmartBatch({
    requests, providers, pairs, travelTimes, workload, now, config, categoryFor,
    offerTtlSeconds: OFFER_TTL_SECONDS, searchTimeoutSeconds: SEARCH_TIMEOUT_SECONDS
  }).assignments.map((assignment) => ({ requestId: assignment.request.id, providerId: assignment.provider.id }));
}

function timed(fn) {
  const start = process.hrtime.bigint();
  const value = fn();
  return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

// ---------------------------------------------------------------- single-batch quality
/** Upper bound on matches: maximum bipartite matching (Hopcroft–Karp is overkill here; augmenting paths suffice). */
function maximumMatching(requests, providers, pairs) {
  const adjacency = new Map(requests.map((request) => [request.id, providers.filter((provider) => pairs.has(`${provider.id}:${request.id}`)).map((provider) => provider.id)]));
  const owner = new Map();
  const tryAssign = (requestId, seen) => {
    for (const providerId of adjacency.get(requestId)) {
      if (seen.has(providerId)) continue;
      seen.add(providerId);
      if (!owner.has(providerId) || tryAssign(owner.get(providerId), seen)) { owner.set(providerId, requestId); return true; }
    }
    return false;
  };
  let size = 0;
  for (const request of requests) if (tryAssign(request.id, new Set())) size += 1;
  return size;
}

function evaluateBatch(input, assignments) {
  const price = costModel(input.requests, input.providers, input.pairs, input.travelTimes, input.workload, input.now);
  const requestById = new Map(input.requests.map((request) => [request.id, request]));
  const providerById = new Map(input.providers.map((provider) => [provider.id, provider]));
  const seenProviders = new Set();
  const etas = [];
  let totalCost = 0;
  const perPriority = Object.fromEntries(PRIORITIES.map((priority) => [priority, { requests: 0, matched: 0, etas: [] }]));
  input.requests.forEach((request) => { perPriority[request.priority].requests += 1; });
  for (const { requestId, providerId } of assignments) {
    const key = `${providerId}:${requestId}`;
    if (!input.pairs.has(key)) throw new Error(`approach assigned an ineligible pair ${key}`);
    if (seenProviders.has(providerId)) throw new Error(`provider ${providerId} assigned twice`);
    seenProviders.add(providerId);
    const request = requestById.get(requestId);
    const eta = input.travelTimes.get(key).durationSeconds;
    etas.push(eta);
    totalCost += price(request, providerById.get(providerId)).cost;
    perPriority[request.priority].matched += 1;
    perPriority[request.priority].etas.push(eta);
  }
  return {
    matched: assignments.length,
    unmatched: input.requests.length - assignments.length,
    matchRate: assignments.length / input.requests.length,
    totalPairCost: totalCost,
    meanPairCost: assignments.length ? totalCost / assignments.length : null,
    meanEtaSeconds: mean(etas),
    p90EtaSeconds: percentile(etas, 90),
    perPriority: Object.fromEntries(PRIORITIES.map((priority) => {
      const bucket = perPriority[priority];
      return [priority, { requests: bucket.requests, matched: bucket.matched, matchRate: bucket.requests ? bucket.matched / bucket.requests : null, meanEtaSeconds: mean(bucket.etas) }];
    }))
  };
}

function singleBatchCases() {
  const base = [
    ["balanced", [[10, 10], [50, 50], [100, 100], [300, 300]], "default", "single"],
    ["scarce", [[100, 20], [300, 60]], "default", "single"],
    ["abundant", [[20, 100], [60, 300]], "default", "single"],
    ["mixed-priority", [[100, 40], [300, 120]], "mixed", "single"],
    ["mixed-categories", [[300, 300]], "default", "mixed"]
  ];
  const cases = [];
  for (const [scenario, sizes, priorityMix, categoryMix] of base) {
    for (const geo of ["uniform", "clustered"]) {
      for (const [requests, providers] of QUICK ? sizes.slice(0, 1).map(([r, p]) => [Math.min(r, 12), Math.min(p, 12)]) : sizes) {
        const name = `${scenario}/${geo}/${requests}x${providers}`;
        cases.push({ name, scenario, geo, requests, providers, priorityMix, categoryMix, seed: hashString(name) });
      }
    }
  }
  return cases;
}

function runSingleBatch() {
  const now = new Date("2026-11-24T12:00:00Z");
  const rows = [];
  for (const spec of singleBatchCases()) {
    const world = generateBatch(spec, now);
    const { pairs, travelTimes } = eligibility(world.requests, world.providers);
    const input = { ...world, pairs, travelTimes, now };
    const maxMatches = maximumMatching(world.requests, world.providers, pairs);
    for (const approach of APPROACHES) {
      const { value, ms } = timed(() => APPROACH_FNS[approach](input));
      rows.push({ case: spec.name, scenario: spec.scenario, geo: spec.geo, requests: spec.requests, providers: spec.providers,
        eligiblePairs: pairs.size, maxPossibleMatches: maxMatches, approach, solveMs: ms, ...evaluateBatch(input, value) });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- runtime (repeated)
function runRuntime() {
  const sizes = QUICK ? [10] : [10, 50, 100, 200, 300];
  const reps = QUICK ? 3 : 30;
  const now = new Date("2026-11-24T12:00:00Z");
  const rows = [];
  for (const n of sizes) {
    const name = `runtime/uniform/${n}x${n}`;
    const world = generateBatch({ seed: hashString(name), requests: n, providers: n, geo: "uniform", priorityMix: "default", categoryMix: "single" }, now);
    const { pairs, travelTimes } = eligibility(world.requests, world.providers);
    const input = { ...world, pairs, travelTimes, now };
    for (const approach of APPROACHES) {
      for (let warm = 0; warm < 2; warm += 1) APPROACH_FNS[approach](input);
      const samples = Array.from({ length: reps }, () => timed(() => APPROACH_FNS[approach](input)).ms);
      rows.push({ size: n, eligiblePairs: pairs.size, approach, runs: reps, medianMs: percentile(samples, 50), p95Ms: percentile(samples, 95), minMs: Math.min(...samples), maxMs: Math.max(...samples) });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- multi-round simulation
/**
 * 10-second batches. Requests arrive (Poisson), wait up to 180 s, are offered to one provider at a time and never
 * re-offered to a provider that declined or let the offer expire. Providers accept with a personal propensity
 * (seeded per request–provider pair, so every approach faces the same answers to the same offer), decline after
 * 10 s or let the offer expire after 20 s, and after accepting are busy for travel + service time, ending at the
 * pickup point. Offer outcomes feed the providers' acceptance / response statistics (terms A and S); accepted jobs
 * feed the recent-workload term F.
 */
function simulate({ name, seed, providers: providerCount, arrivalsPerRound, rounds, geo }, approach, solve = APPROACH_FNS[approach]) {
  const dt = 10;
  const random = mulberry32(seed);
  const where = locationSampler(random, geo);
  const providers = Array.from({ length: providerCount }, (_, index) => makeProvider(random, index, "mechanic", where()));
  for (const provider of providers) {
    provider.providerPerformance = { acceptedOffers: 0, declinedOffers: 0, expiredOffers: 0, responseSamples: 0, averageResponseSeconds: null };
  }
  const arrivals = [];
  for (let r = 0; r < rounds; r += 1) {
    // Poisson(λ) by inversion.
    let k = 0; let p = Math.exp(-arrivalsPerRound); let s = p; const u = random();
    while (u > s) { k += 1; p *= arrivalsPerRound / k; s += p; }
    for (let i = 0; i < k; i += 1) {
      arrivals.push({ round: r, location: where(), priority: pick(random, PRIORITY_MIX.default), serviceSeconds: (8 + random() * 17) * 60 });
    }
  }
  const start = new Date("2026-11-24T12:00:00Z");
  const state = new Map(providers.map((provider) => [provider.id, { busyUntil: -1, offer: null, jobs: 0 }]));
  const requests = arrivals.map((arrival, index) => ({
    ...makeRequest(null, index, "mechanic", arrival.location, arrival.priority, new Date(+start + arrival.round * dt * 1000)),
    arrivalRound: arrival.round, serviceSeconds: arrival.serviceSeconds, attempted: new Set(), offeredTo: null, assignedRound: null, eta: null, lost: false
  }));
  const respond = (provider, outcome, seconds) => {
    const perf = provider.providerPerformance;
    if (outcome === "expired") { perf.expiredOffers += 1; return; }
    perf[outcome === "accepted" ? "acceptedOffers" : "declinedOffers"] += 1;
    perf.averageResponseSeconds = ((perf.averageResponseSeconds || 0) * perf.responseSamples + seconds) / (perf.responseSamples + 1);
    perf.responseSamples += 1;
  };
  const solveMs = [];
  const reoptimizeMs = [];
  const batchRequests = [];
  const batchProviders = [];
  let busyProviderRounds = 0;
  let offers = 0; let declines = 0; let expiries = 0;

  for (let r = 0; r < rounds; r += 1) {
    const now = new Date(+start + r * dt * 1000);
    let resolvedNegative = false;
    // Resolve offers due this round.
    for (const provider of providers) {
      const s = state.get(provider.id);
      if (!s.offer || s.offer.dueRound > r) continue;
      const request = requests[s.offer.requestIndex];
      respond(provider, s.offer.outcome, s.offer.responseSeconds);
      request.offeredTo = null;
      if (s.offer.outcome === "accepted") {
        request.assignedRound = r;
        request.eta = s.offer.eta;
        s.busyUntil = r + Math.ceil((s.offer.eta + request.serviceSeconds) / dt);
        s.jobs += 1;
        provider.providerState = { currentLocation: request.pickupLocation };
      } else {
        resolvedNegative = true;
        if (s.offer.outcome === "declined") declines += 1; else expiries += 1;
      }
      s.offer = null;
    }
    // Search timeout.
    for (const request of requests) {
      if (request.arrivalRound <= r && request.assignedRound == null && !request.lost && !request.offeredTo && (r - request.arrivalRound) * dt >= SEARCH_TIMEOUT_SECONDS) request.lost = true;
    }
    const free = providers.filter((provider) => { const s = state.get(provider.id); return !s.offer && s.busyUntil <= r; });
    busyProviderRounds += providers.length - free.length;
    const pending = requests.filter((request) => request.arrivalRound <= r && request.assignedRound == null && !request.lost && !request.offeredTo);
    if (!pending.length || !free.length) continue;

    const eligible = eligibility(pending, free);
    for (const [key, pair] of [...eligible.pairs]) {
      if (pair.request.attempted.has(pair.provider.id)) { eligible.pairs.delete(key); eligible.travelTimes.delete(key); }
    }
    const workload = new Map(providers.map((provider) => [provider.id, state.get(provider.id).jobs]));
    const input = { requests: pending, providers: free, ...eligible, workload, now };
    const { value, ms } = timed(() => solve(input));
    solveMs.push(ms);
    batchRequests.push(pending.length);
    batchProviders.push(free.length);
    if (resolvedNegative) reoptimizeMs.push(ms);
    const requestIndex = new Map(pending.map((request) => [request.id, Number(request.id.slice(1))]));
    for (const { requestId, providerId } of value) {
      const request = requests[requestIndex.get(requestId)];
      const provider = providers.find((candidate) => candidate.id === providerId);
      const eta = eligible.travelTimes.get(`${providerId}:${requestId}`).durationSeconds;
      const accepted = unitHash(name, requestId, providerId, "accept") < provider.propensity;
      const outcome = accepted ? "accepted" : unitHash(name, requestId, providerId, "decline") < 0.6 ? "declined" : "expired";
      offers += 1;
      request.attempted.add(providerId);
      request.offeredTo = providerId;
      state.get(providerId).offer = {
        requestIndex: requestIndex.get(requestId), outcome, eta,
        dueRound: r + (outcome === "expired" ? 2 : 1),
        responseSeconds: outcome === "expired" ? OFFER_TTL_SECONDS : 2 + unitHash(name, requestId, providerId, "rt") * 13
      };
    }
  }

  const arrived = requests.filter((request) => request.arrivalRound < rounds);
  const served = arrived.filter((request) => request.assignedRound != null);
  const jobs = providers.map((provider) => state.get(provider.id).jobs);
  const waits = served.map((request) => (request.assignedRound - request.arrivalRound) * dt);
  return {
    scenario: name, approach, providers: providerCount, rounds, roundSeconds: dt, arrivals: arrived.length,
    served: served.length, servedRate: served.length / arrived.length,
    lost: arrived.filter((request) => request.lost).length,
    stillOpenAtEnd: arrived.length - served.length - arrived.filter((request) => request.lost).length,
    offers, declines, expiries,
    meanEtaSeconds: mean(served.map((request) => request.eta)), p90EtaSeconds: percentile(served.map((request) => request.eta), 90),
    meanWaitSeconds: mean(waits), p90WaitSeconds: percentile(waits, 90),
    utilization: busyProviderRounds / (providerCount * rounds),
    jobsPerProvider: { mean: mean(jobs), stdDev: stdDev(jobs), gini: gini(jobs), min: Math.min(...jobs), max: Math.max(...jobs), idleProviders: jobs.filter((count) => count === 0).length },
    perPriority: Object.fromEntries(PRIORITIES.map((priority) => {
      const mine = arrived.filter((request) => request.priority === priority);
      const done = mine.filter((request) => request.assignedRound != null);
      return [priority, { arrivals: mine.length, served: done.length, servedRate: mine.length ? done.length / mine.length : null,
        meanWaitSeconds: mean(done.map((request) => (request.assignedRound - request.arrivalRound) * dt)), meanEtaSeconds: mean(done.map((request) => request.eta)) }];
    })),
    batchSize: { meanRequests: mean(batchRequests), maxRequests: Math.max(0, ...batchRequests), meanFreeProviders: mean(batchProviders), maxFreeProviders: Math.max(0, ...batchProviders) },
    solveMs: { rounds: solveMs.length, median: percentile(solveMs, 50), p95: percentile(solveMs, 95), max: solveMs.length ? Math.max(...solveMs) : null },
    reoptimizeAfterDeclineMs: { rounds: reoptimizeMs.length, median: percentile(reoptimizeMs, 50), p95: percentile(reoptimizeMs, 95), max: reoptimizeMs.length ? Math.max(...reoptimizeMs) : null }
  };
}

function simulationSpecs() {
  return QUICK
    ? [{ name: "sim/uniform/quick", geo: "uniform", providers: 8, arrivalsPerRound: 0.1, rounds: 30 }]
    : [
      { name: "sim/uniform/normal-load", geo: "uniform", providers: 60, arrivalsPerRound: 0.35, rounds: 360 },
      { name: "sim/uniform/peak-load", geo: "uniform", providers: 60, arrivalsPerRound: 0.7, rounds: 360 },
      { name: "sim/clustered/normal-load", geo: "clustered", providers: 60, arrivalsPerRound: 0.35, rounds: 360 },
      { name: "sim/clustered/peak-load", geo: "clustered", providers: 60, arrivalsPerRound: 0.7, rounds: 360 },
      // Large city, overloaded: big pending queues, so re-optimisation time is measured on large batches too.
      { name: "sim/uniform/large-overload", geo: "uniform", providers: 300, arrivalsPerRound: 4.0, rounds: 360 }
    ];
}

function runSimulation() {
  return simulationSpecs().flatMap((spec) => APPROACHES.map((approach) => simulate({ ...spec, seed: hashString(spec.name) }, approach)));
}


// ---------------------------------------------------------------- markdown summary (tables quoted in 07-benchmark.md)
const SHORT = { "nearest-first": "(a) nearest-first", "greedy-cost": "(b) greedy new-cost", "existing-mcf": "(c) existing min-cost flow", "smart-hungarian": "(d) smart Hungarian" };
const fmt = (value, digits = 1) => (value == null || Number.isNaN(value) ? "–" : Number(value).toFixed(digits));
const pct = (value) => (value == null ? "–" : `${(value * 100).toFixed(1)}%`);
function table(headers, rows) {
  return [`| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

function summarize(environment, singleBatch, runtime, simulation) {
  const out = [`# Benchmark summary (generated)`, "", `Node ${environment.node} · ${environment.cpu} (${environment.logicalCores} logical cores) · ${environment.platform} · ETA: ${environment.eta}`, ""];

  // 1. Aggregate over every single-batch case.
  out.push("## Single batch: all cases", "");
  const cases = new Set(singleBatch.map((row) => row.case)).size;
  out.push(table(["approach", "cases at max matches", "matched / possible", "urgent matched", "high matched", "normal matched", "mean ETA (s)", "mean pair cost per match"],
    APPROACHES.map((approach) => {
      const rows = singleBatch.filter((row) => row.approach === approach);
      const sum = (fn) => rows.reduce((total, row) => total + fn(row), 0);
      const prio = (priority) => `${sum((row) => row.perPriority[priority].matched)}/${sum((row) => row.perPriority[priority].requests)} (${pct(sum((row) => row.perPriority[priority].matched) / sum((row) => row.perPriority[priority].requests))})`;
      const etaWeighted = sum((row) => (row.meanEtaSeconds || 0) * row.matched) / sum((row) => row.matched);
      return [SHORT[approach], `${rows.filter((row) => row.matched === row.maxPossibleMatches).length}/${cases}`,
        `${sum((row) => row.matched)}/${sum((row) => row.maxPossibleMatches)}`, prio("urgent"), prio("high"), prio("normal"),
        fmt(etaWeighted, 0), fmt(sum((row) => row.totalPairCost) / sum((row) => row.matched), 2)];
    })), "", "Requests in all cases combined: " + singleBatch.filter((row) => row.approach === APPROACHES[0]).reduce((total, row) => total + row.requests, 0) + ".", "");

  // 2. Per case at the largest size of each scenario.
  out.push("## Single batch: per case (largest size per scenario)", "");
  const largest = [...new Set(singleBatch.map((row) => row.case))].filter((name) => {
    const [scenario, geo] = name.split("/");
    const sizes = singleBatch.filter((row) => row.scenario === scenario && row.geo === geo).map((row) => row.requests * row.providers);
    const row = singleBatch.find((candidate) => candidate.case === name);
    return row.requests * row.providers === Math.max(...sizes);
  });
  out.push(table(["case", "approach", "matched / max", "total pair cost", "cost / match", "mean ETA (s)", "p90 ETA (s)", "urgent", "high", "normal", "solve (ms)"],
    largest.flatMap((name) => APPROACHES.map((approach) => {
      const row = singleBatch.find((candidate) => candidate.case === name && candidate.approach === approach);
      const prio = (priority) => (row.perPriority[priority].requests ? `${row.perPriority[priority].matched}/${row.perPriority[priority].requests}` : "–");
      return [name, SHORT[approach], `${row.matched}/${row.maxPossibleMatches}`, fmt(row.totalPairCost, 0), fmt(row.meanPairCost, 2), fmt(row.meanEtaSeconds, 0), fmt(row.p90EtaSeconds, 0), prio("urgent"), prio("high"), prio("normal"), fmt(row.solveMs, 1)];
    }))), "");

  // 3. Per-priority ETA in the mixed-priority cases.
  out.push("## Single batch: per-priority match rate and mean ETA (mixed-priority scenario, 25 % urgent)", "");
  out.push(table(["case", "approach", "urgent", "urgent ETA (s)", "high", "high ETA (s)", "normal", "normal ETA (s)"],
    singleBatch.filter((row) => row.scenario === "mixed-priority").map((row) => [row.case, SHORT[row.approach],
      pct(row.perPriority.urgent.matchRate), fmt(row.perPriority.urgent.meanEtaSeconds, 0), pct(row.perPriority.high.matchRate), fmt(row.perPriority.high.meanEtaSeconds, 0),
      pct(row.perPriority.normal.matchRate), fmt(row.perPriority.normal.meanEtaSeconds, 0)])), "");

  // 4. Runtime.
  out.push(`## Runtime per batch (balanced, uniform; ${runtime[0]?.runs} timed runs after 2 warm-ups)`, "");
  out.push(table(["R = P", "eligible pairs", ...APPROACHES.map((approach) => `${SHORT[approach]} median / p95 (ms)`)],
    [...new Set(runtime.map((row) => row.size))].map((size) => {
      const rows = runtime.filter((row) => row.size === size);
      return [size, rows[0].eligiblePairs, ...APPROACHES.map((approach) => { const row = rows.find((candidate) => candidate.approach === approach); return `${fmt(row.medianMs, 2)} / ${fmt(row.p95Ms, 2)}`; })];
    })), "");

  // 5. Simulation.
  out.push("## Multi-round simulation (10 s batches)", "");
  out.push(table(["scenario", "approach", "arrivals", "served", "lost (timeout)", "urgent served", "mean wait (s)", "mean ETA (s)", "utilization", "jobs/provider Gini", "std-dev", "idle providers", "declines / expiries", "solve median / p95 (ms)", "re-opt after decline median / p95 (ms)", "mean batch (req × free prov)"],
    simulation.map((row) => [row.scenario, SHORT[row.approach], row.arrivals, `${row.served} (${pct(row.servedRate)})`, row.lost,
      `${row.perPriority.urgent.served}/${row.perPriority.urgent.arrivals}`, fmt(row.meanWaitSeconds, 0), fmt(row.meanEtaSeconds, 0), pct(row.utilization),
      fmt(row.jobsPerProvider.gini, 3), fmt(row.jobsPerProvider.stdDev, 2), row.jobsPerProvider.idleProviders, `${row.declines} / ${row.expiries}`,
      `${fmt(row.solveMs.median, 3)} / ${fmt(row.solveMs.p95, 3)}`, `${fmt(row.reoptimizeAfterDeclineMs.median, 3)} / ${fmt(row.reoptimizeAfterDeclineMs.p95, 3)}`,
      `${fmt(row.batchSize.meanRequests, 1)} × ${fmt(row.batchSize.meanFreeProviders, 1)}`])), "");
  return out.join("\n");
}


// ---------------------------------------------------------------- weight sensitivity of (d)
/** Raise one or two weights and scale the remaining ones proportionally so the total stays 1. */
function scaledWeights(fixed) {
  const base = CONFIG.weights;
  const fixedTotal = Object.values(fixed).reduce((a, b) => a + b, 0);
  const restTotal = Object.entries(base).filter(([term]) => !(term in fixed)).reduce((sum, [, weight]) => sum + weight, 0);
  const weights = {};
  for (const [term, weight] of Object.entries(base)) weights[term] = term in fixed ? fixed[term] : (weight * (1 - fixedTotal)) / restTotal;
  return weights;
}
const WEIGHT_SETS = [
  { name: "default", weights: { ...CONFIG.weights } },
  { name: "eta-heavy (E 0.50)", weights: scaledWeights({ E: 0.50 }) },
  { name: "eta-dominant (E 0.70)", weights: scaledWeights({ E: 0.70 }) },
  { name: "fairness-heavy (F 0.30)", weights: scaledWeights({ F: 0.30 }) },
  { name: "quality-heavy (Q 0.35)", weights: scaledWeights({ Q: 0.35 }) },
  { name: "eta+fairness (E 0.45, F 0.25)", weights: scaledWeights({ E: 0.45, F: 0.25 }) }
];

function aggregateBatches(rows, filter = () => true) {
  const selected = rows.filter(filter);
  const sum = (fn) => selected.reduce((total, row) => total + fn(row), 0);
  const weightedEta = (fnEta, fnCount) => { const n = sum(fnCount); return n ? sum((row) => (fnEta(row) || 0) * fnCount(row)) / n : null; };
  const rate = (priority) => sum((row) => row.perPriority[priority].matched) / sum((row) => row.perPriority[priority].requests);
  return {
    cases: selected.length,
    casesAtMax: selected.filter((row) => row.matched === row.maxPossibleMatches).length,
    matched: sum((row) => row.matched), possible: sum((row) => row.maxPossibleMatches), requests: sum((row) => row.requests),
    urgentRate: rate("urgent"), highRate: rate("high"), normalRate: rate("normal"),
    meanEta: weightedEta((row) => row.meanEtaSeconds, (row) => row.matched),
    urgentEta: weightedEta((row) => row.perPriority.urgent.meanEtaSeconds, (row) => row.perPriority.urgent.matched),
    highEta: weightedEta((row) => row.perPriority.high.meanEtaSeconds, (row) => row.perPriority.high.matched)
  };
}

function runSensitivity() {
  const now = new Date("2026-11-24T12:00:00Z");
  const variants = [
    ...WEIGHT_SETS.map((set) => {
      const env = Object.fromEntries(Object.entries(set.weights).map(([term, weight]) => [`MATCHING_WEIGHT_${term}`, weight.toPrecision(15)]));
      return { label: `(d) ${set.name}`, weights: set.weights, solve: smartWith(getMatchingConfig(env)) };
    }),
    { label: "(c) existing min-cost flow (reference)", weights: null, solve: APPROACH_FNS["existing-mcf"] },
    { label: "(b) greedy new-cost (reference)", weights: null, solve: APPROACH_FNS["greedy-cost"] }
  ];
  const cases = singleBatchCases().map((spec) => {
    const world = generateBatch(spec, now);
    const { pairs, travelTimes } = eligibility(world.requests, world.providers);
    return { spec, input: { ...world, pairs, travelTimes, now }, maxPossibleMatches: maximumMatching(world.requests, world.providers, pairs) };
  });
  return variants.map((variant) => {
    const rows = cases.map(({ spec, input, maxPossibleMatches }) => ({
      case: spec.name, scenario: spec.scenario, requests: spec.requests, maxPossibleMatches, ...evaluateBatch(input, variant.solve(input))
    }));
    const simulations = simulationSpecs().map((spec) => {
      const result = simulate({ ...spec, seed: hashString(spec.name) }, variant.label, variant.solve);
      return { scenario: spec.name, arrivals: result.arrivals, served: result.served, servedRate: result.servedRate, urgentServed: result.perPriority.urgent.served,
        urgentArrivals: result.perPriority.urgent.arrivals, meanWaitSeconds: result.meanWaitSeconds, meanEtaSeconds: result.meanEtaSeconds,
        gini: result.jobsPerProvider.gini, jobsStdDev: result.jobsPerProvider.stdDev };
    });
    return {
      variant: variant.label, weights: variant.weights,
      singleBatch: {
        all: aggregateBatches(rows),
        abundant: aggregateBatches(rows, (row) => row.scenario === "abundant"),
        scarce: aggregateBatches(rows, (row) => row.scenario === "scarce"),
        mixedPriority: aggregateBatches(rows, (row) => row.scenario === "mixed-priority")
      },
      simulations
    };
  });
}

function summarizeSensitivity(results) {
  const out = ["# Weight sensitivity of (d) (generated)", "", "Same seeds, cases and simulations as the main benchmark. Rows marked (reference) are the other approaches, unchanged.", ""];
  out.push("## Weights", "");
  out.push(table(["variant", "E", "Q", "A", "S", "F", "T"], results.filter((row) => row.weights).map((row) => [row.variant, ...["E", "Q", "A", "S", "F", "T"].map((term) => fmt(row.weights[term], 3))])), "");
  out.push("## Single batch (22 cases)", "");
  out.push(table(["variant", "cases at max", "matched / possible", "urgent", "high", "normal", "mean ETA (s)", "urgent ETA (s)", "high ETA (s)", "abundant: mean ETA (s)", "mixed-priority: urgent ETA (s)"],
    results.map((row) => { const all = row.singleBatch.all; return [row.variant, `${all.casesAtMax}/${all.cases}`, `${all.matched}/${all.possible}`, pct(all.urgentRate), pct(all.highRate), pct(all.normalRate),
      fmt(all.meanEta, 0), fmt(all.urgentEta, 0), fmt(all.highEta, 0), fmt(row.singleBatch.abundant.meanEta, 0), fmt(row.singleBatch.mixedPriority.urgentEta, 0)]; })), "");
  const sims = results[0].simulations.map((sim) => sim.scenario);
  out.push("## Simulation: workload Gini (jobs per provider; lower = more even)", "");
  out.push(table(["variant", ...sims], results.map((row) => [row.variant, ...row.simulations.map((sim) => fmt(sim.gini, 3))])), "");
  out.push("## Simulation: served / mean ETA (s) / urgent served", "");
  out.push(table(["variant", ...sims], results.map((row) => [row.variant, ...row.simulations.map((sim) => `${sim.served} / ${fmt(sim.meanEtaSeconds, 0)} / ${sim.urgentServed}/${sim.urgentArrivals}`)])), "");
  return out.join("\n");
}

// ---------------------------------------------------------------- output
function toCsv(rows) {
  const flat = rows.map((row) => {
    const out = {};
    (function walk(value, prefix) {
      if (value && typeof value === "object" && !Array.isArray(value)) Object.entries(value).forEach(([key, inner]) => walk(inner, prefix ? `${prefix}.${key}` : key));
      else out[prefix] = typeof value === "number" ? round(value, 4) : value;
    })(row, "");
    return out;
  });
  const columns = [...new Set(flat.flatMap((row) => Object.keys(row)))];
  return [columns.join(","), ...flat.map((row) => columns.map((column) => row[column] ?? "").join(","))].join("\n") + "\n";
}

function main() {
  const environment = {
    generatedAt: new Date().toISOString(), node: process.version, platform: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model, logicalCores: os.cpus().length, memoryGiB: round(os.totalmem() / 2 ** 30, 1),
    quick: QUICK, eta: "straight line at 25 km/h, 60 s floor (services/travelTimeMatrix.js fallbackBlock); OSRM excluded",
    config: { weights: CONFIG.weights, unmatchedBaseCost: CONFIG.unmatchedBaseCost, priorityMultipliers: CONFIG.priorityMultipliers, maxBatchSize: CONFIG.maxBatchSize, radiusKm: RADIUS_KM }
  };
  const started = Date.now();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const writeSensitivity = () => {
    const sensitivity = runSensitivity();
    console.log(`sensitivity: ${sensitivity.length} variants (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    fs.writeFileSync(path.join(OUT_DIR, "sensitivity.json"), `${JSON.stringify({ environment, results: sensitivity }, null, 2)}\n`);
    fs.writeFileSync(path.join(OUT_DIR, "sensitivity.csv"), toCsv(sensitivity.flatMap((row) => [
      ...Object.entries(row.singleBatch).map(([subset, value]) => ({ variant: row.variant, part: `single-batch/${subset}`, ...value })),
      ...row.simulations.map((sim) => ({ variant: row.variant, part: "simulation", ...sim }))
    ])));
    fs.writeFileSync(path.join(OUT_DIR, "sensitivity-summary.md"), `${summarizeSensitivity(sensitivity)}\n`);
  };
  if (ONLY === "sensitivity") {
    writeSensitivity();
    console.log(`wrote sensitivity files to ${OUT_DIR}`);
    return;
  }
  const singleBatch = runSingleBatch();
  console.log(`single-batch: ${singleBatch.length} rows (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  const runtime = runRuntime();
  console.log(`runtime: ${runtime.length} rows (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  const simulation = runSimulation();
  console.log(`simulation: ${simulation.length} rows (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  fs.writeFileSync(path.join(OUT_DIR, "environment.json"), `${JSON.stringify(environment, null, 2)}\n`);
  for (const [file, rows] of [["single-batch", singleBatch], ["runtime", runtime], ["simulation", simulation]]) {
    fs.writeFileSync(path.join(OUT_DIR, `${file}.json`), `${JSON.stringify(rows, null, 2)}\n`);
    fs.writeFileSync(path.join(OUT_DIR, `${file}.csv`), toCsv(rows));
  }
  fs.writeFileSync(path.join(OUT_DIR, "summary.md"), `${summarize(environment, singleBatch, runtime, simulation)}\n`);
  writeSensitivity();
  console.log(`wrote ${OUT_DIR}`);
}

if (require.main === module) main();

module.exports = { APPROACH_FNS, WEIGHT_SETS, scaledWeights, evaluateBatch, eligibility, generateBatch, gini, maximumMatching, percentile, simulate };
