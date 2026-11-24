// Pure planning step of the smart dispatcher: per-category cost matrices → Hungarian → offer plan.
// No DB access: services/dispatch.js supplies eligible pairs (8 km radius and every other hard constraint already
// applied), travel times and recent workload, then turns the plan into offers through its existing createOffer.
//
// Reporting rule: an assignment's `pairCost` is the real 0–100 pair cost. Unmatched penalties (U_batch-inflated)
// exist only inside the solver objective and are never returned as, or added to, an assignment cost.

const { COST_SCALE, assertNumericSafety, scaledUnmatchedCell, unmatchedBaseCostFor } = require("../config/matching");
const { median, pairCost } = require("./cost");
const { orderProviders, orderRequests, solveMatrix } = require("./hungarian");

const idOf = (value) => String(value?.id ?? value?._id);
const timeOf = (value) => new Date(value?.createdAt ?? 0).getTime() || 0;

function multiplierOf(request, config) {
  return config.priorityMultipliers[request?.priority] ?? config.priorityMultipliers.normal;
}

/** Highest priority first, then oldest, then id: decides who enters a capped batch. */
function byPriorityThenAge(config) {
  return (a, b) => multiplierOf(b, config) - multiplierOf(a, config)
    || timeOf(a) - timeOf(b)
    || (idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0);
}

function planCategory({ category, requests, providers, pairs, travelTimes, workload, now, config, offerTtlSeconds, searchTimeoutSeconds }) {
  const prioritised = [...requests].sort(byPriorityThenAge(config));
  const admitted = prioritised.slice(0, config.maxBatchSize);
  const deferredRequestIds = prioritised.slice(config.maxBatchSize).map(idOf);

  const usable = (request, provider) => {
    const key = `${idOf(provider)}:${idOf(request)}`;
    const travel = travelTimes.get(key);
    return pairs.has(key) && travel && Number.isFinite(travel.durationSeconds) ? travel : null;
  };
  // Only providers with at least one usable pair; above the cap keep those with the shortest best ETA.
  const candidates = providers
    .map((provider) => {
      const etas = admitted.map((request) => usable(request, provider)?.durationSeconds).filter(Number.isFinite);
      return etas.length ? { provider, bestEta: Math.min(...etas) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.bestEta - b.bestEta || (idOf(a.provider) < idOf(b.provider) ? -1 : 1))
    .slice(0, config.maxBatchSize)
    .map(({ provider }) => provider);

  const orderedRequests = orderRequests(admitted);
  const orderedProviders = orderProviders(candidates);
  const rows = orderedRequests.length;
  const columns = orderedProviders.length;
  const medianWorkload = median(orderedProviders.map((provider) => workload.get(idOf(provider)) || 0));

  const details = orderedRequests.map(() => Array(columns).fill(null));
  const matrix = orderedRequests.map((request, row) => orderedProviders.map((provider, column) => {
    const travel = usable(request, provider);
    if (!travel) return null;
    const priced = pairCost(request, provider, {
      now,
      etaSeconds: travel.durationSeconds,
      radiusKm: request.dispatch?.radiusKm,
      offerTtlSeconds,
      searchTimeoutSeconds,
      recentAssignments: workload.get(idOf(provider)) || 0,
      medianRecentAssignments: medianWorkload
    }, config);
    if (!priced) return null;
    details[row][column] = { travel, ...priced };
    // Integer milli-units: exact solver arithmetic; quantisation error ≤ 0.0005 cost points per pair.
    return Math.round(priced.cost * COST_SCALE);
  }));

  const numeric = assertNumericSafety(config, rows, columns);
  const unmatched = orderedRequests.map((request) => scaledUnmatchedCell(rows, columns, multiplierOf(request, config), config));
  const solution = solveMatrix(matrix, unmatched);

  const assignments = [];
  const unmatchedRequestIds = [];
  solution.rowToColumn.forEach((column, row) => {
    const request = orderedRequests[row];
    if (column == null) {
      unmatchedRequestIds.push(idOf(request));
      return;
    }
    const provider = orderedProviders[column];
    const detail = details[row][column];
    assignments.push({
      category,
      request,
      provider,
      pair: pairs.get(`${idOf(provider)}:${idOf(request)}`),
      travel: detail.travel,
      pairCost: detail.cost,
      breakdown: detail.breakdown,
      weights: detail.weights
    });
  });

  return {
    summary: {
      category,
      requests: rows,
      providers: columns,
      matched: assignments.length,
      unmatchedCount: unmatchedRequestIds.length + deferredRequestIds.length,
      deferredCount: deferredRequestIds.length,
      assignedCost: assignments.reduce((sum, item) => sum + item.pairCost, 0),
      unmatchedBaseCost: unmatchedBaseCostFor(rows, columns, config),
      largestSolverValue: numeric.objectiveBound
    },
    assignments,
    unmatchedRequestIds: [...unmatchedRequestIds, ...deferredRequestIds]
  };
}

/**
 * @param {object} input
 * @param {object[]} input.requests    searching requests (mongoose docs or plain objects with id, category, priority, createdAt, dispatch.radiusKm)
 * @param {object[]} input.providers   eligible providers (mechanicProfile.serviceCategory)
 * @param {Map<string, object>} input.pairs        `${providerId}:${requestId}` → eligible pair from the dispatcher
 * @param {Map<string, object>} input.travelTimes  same keys → { durationSeconds, distanceMeters?, source? }
 * @param {Map<string, number>} input.workload     providerId → assignments in the fairness window
 * @param {(category: string) => string} input.categoryFor request category → provider service category
 */
function planSmartBatch({ requests, providers, pairs, travelTimes, workload = new Map(), now, config, offerTtlSeconds, searchTimeoutSeconds, categoryFor }) {
  const categories = [...new Set(requests.map((request) => categoryFor(request.category)))].sort();
  const plans = categories.map((category) => planCategory({
    category,
    requests: requests.filter((request) => categoryFor(request.category) === category),
    providers: providers.filter((provider) => provider.mechanicProfile?.serviceCategory === category),
    pairs, travelTimes, workload, now, config, offerTtlSeconds, searchTimeoutSeconds
  }));
  const assignments = plans.flatMap((plan) => plan.assignments);
  const unmatchedRequestIds = plans.flatMap((plan) => plan.unmatchedRequestIds);
  return {
    categories: plans.map((plan) => plan.summary),
    assignments,
    unmatchedRequestIds,
    assignedCost: assignments.reduce((sum, item) => sum + item.pairCost, 0),
    unmatchedCount: unmatchedRequestIds.length
  };
}

module.exports = { planSmartBatch };
