const PRIORITY_WEIGHTS = Object.freeze({ normal: 1, high: 2, urgent: 4 });
const DEFAULT_WAIT_THRESHOLD_SECONDS = 45 * 60;

function idOf(value) {
  return String(value?.id ?? value?._id ?? value?.requestId ?? value?.providerId ?? value);
}

function priorityWeight(priority) {
  return PRIORITY_WEIGHTS[priority] || PRIORITY_WEIGHTS.normal;
}

function waitingCostFor(request, now = new Date()) {
  const createdAt = new Date(request.createdAt || now).getTime();
  const waitedSeconds = Number.isFinite(createdAt)
    ? Math.max(0, Math.round((now.getTime() - createdAt) / 1000))
    : 0;
  return priorityWeight(request.priority) * (DEFAULT_WAIT_THRESHOLD_SECONDS + waitedSeconds);
}

function travelValue(travelTimes, requestId, providerId) {
  const direct = travelTimes instanceof Map
    ? travelTimes.get(`${providerId}:${requestId}`)
    : travelTimes?.[providerId]?.[requestId] ?? travelTimes?.[`${providerId}:${requestId}`];
  if (Number.isFinite(direct)) return { durationSeconds: Number(direct) };
  if (Number.isFinite(direct?.durationSeconds)) return direct;
  return null;
}

function solveAssignment({ requests, providers, travelTimes, now = new Date() }) {
  const orderedRequests = [...requests].sort((a, b) => idOf(a).localeCompare(idOf(b)));
  const orderedProviders = [...providers].sort((a, b) => idOf(a).localeCompare(idOf(b)));
  if (!orderedRequests.length) return { assignments: [], unassignedRequestIds: [], totalCost: 0 };

  const source = 0;
  const requestStart = 1;
  const providerStart = requestStart + orderedRequests.length;
  const waiting = providerStart + orderedProviders.length;
  const sink = waiting + 1;
  const graph = Array.from({ length: sink + 1 }, () => []);
  const assignmentEdges = [];
  const waitingEdges = [];

  function addEdge(from, to, capacity, cost, metadata = null) {
    const forward = { to, rev: graph[to].length, capacity, cost, initialCapacity: capacity, metadata };
    const reverse = { to: from, rev: graph[from].length, capacity: 0, cost: -cost, initialCapacity: 0, metadata: null };
    graph[from].push(forward);
    graph[to].push(reverse);
    return forward;
  }

  orderedRequests.forEach((request, requestIndex) => {
    const requestId = idOf(request);
    const requestNode = requestStart + requestIndex;
    addEdge(source, requestNode, 1, 0);
    const waitCost = waitingCostFor(request, now);
    waitingEdges.push({
      requestId,
      edge: addEdge(requestNode, waiting, 1, waitCost, { kind: "waiting", requestId }),
      cost: waitCost
    });

    orderedProviders.forEach((provider, providerIndex) => {
      const providerId = idOf(provider);
      const travel = travelValue(travelTimes, requestId, providerId);
      if (!travel || travel.durationSeconds < 0) return;
      const durationSeconds = Math.max(1, Math.round(travel.durationSeconds));
      const cost = priorityWeight(request.priority) * durationSeconds;
      const edge = addEdge(requestNode, providerStart + providerIndex, 1, cost, {
        kind: "assignment", requestId, providerId, durationSeconds
      });
      assignmentEdges.push({ requestId, providerId, durationSeconds, cost, travel, edge });
    });
  });

  orderedProviders.forEach((provider, providerIndex) => {
    addEdge(providerStart + providerIndex, sink, 1, 0, { kind: "provider", providerId: idOf(provider) });
  });
  addEdge(waiting, sink, orderedRequests.length, 0);

  let totalCost = 0;
  for (let sent = 0; sent < orderedRequests.length; sent += 1) {
    const distance = Array(graph.length).fill(Infinity);
    const previousNode = Array(graph.length).fill(-1);
    const previousEdge = Array(graph.length).fill(-1);
    const inQueue = Array(graph.length).fill(false);
    const queue = [source];
    distance[source] = 0;
    inQueue[source] = true;

    while (queue.length) {
      const node = queue.shift();
      inQueue[node] = false;
      graph[node].forEach((edge, edgeIndex) => {
        if (edge.capacity <= 0 || distance[edge.to] <= distance[node] + edge.cost) return;
        distance[edge.to] = distance[node] + edge.cost;
        previousNode[edge.to] = node;
        previousEdge[edge.to] = edgeIndex;
        if (!inQueue[edge.to]) {
          queue.push(edge.to);
          inQueue[edge.to] = true;
        }
      });
    }

    if (!Number.isFinite(distance[sink])) throw new Error("Assignment graph cannot route every request");
    totalCost += distance[sink];
    for (let node = sink; node !== source; node = previousNode[node]) {
      const edge = graph[previousNode[node]][previousEdge[node]];
      edge.capacity -= 1;
      graph[node][edge.rev].capacity += 1;
    }
  }

  const assignments = assignmentEdges
    .filter(({ edge }) => edge.initialCapacity - edge.capacity === 1)
    .map(({ requestId, providerId, durationSeconds, cost, travel }) => ({
      requestId, providerId, durationSeconds, cost,
      distanceMeters: Number.isFinite(travel.distanceMeters) ? travel.distanceMeters : null,
      source: travel.source || "provided"
    }));
  const assignedRequests = new Set(assignments.map((item) => item.requestId));
  const unassignedRequestIds = waitingEdges
    .filter(({ requestId }) => !assignedRequests.has(requestId))
    .map(({ requestId }) => requestId);

  return { assignments, unassignedRequestIds, totalCost };
}

module.exports = {
  DEFAULT_WAIT_THRESHOLD_SECONDS,
  PRIORITY_WEIGHTS,
  priorityWeight,
  solveAssignment,
  waitingCostFor
};
