const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { solveAssignment, waitingCostFor } = require("../src/services/assignmentSolver");

function matrix(entries) {
  return new Map(entries.map(([providerId, requestId, minutes]) => [
    `${providerId}:${requestId}`,
    { durationSeconds: minutes * 60, source: "provided" }
  ]));
}

describe("minimum-cost batch assignment", () => {
  it("finds the global 9-minute assignment instead of the 23-minute greedy result", () => {
    const result = solveAssignment({
      requests: [
        { id: "R1", priority: "normal", createdAt: new Date() },
        { id: "R2", priority: "normal", createdAt: new Date() }
      ],
      providers: [{ id: "P1" }, { id: "P2" }],
      travelTimes: matrix([
        ["P1", "R1", 3], ["P2", "R1", 5],
        ["P1", "R2", 4], ["P2", "R2", 20]
      ])
    });
    assert.deepEqual(
      result.assignments.map(({ requestId, providerId }) => ({ requestId, providerId })).sort((a, b) => a.requestId.localeCompare(b.requestId)),
      [{ requestId: "R1", providerId: "P2" }, { requestId: "R2", providerId: "P1" }]
    );
    assert.equal(result.assignments.reduce((sum, item) => sum + item.durationSeconds, 0), 9 * 60);
    assert.deepEqual(result.unassignedRequestIds, []);
  });

  it("leaves excess requests waiting and gives an urgent request the scarce provider", () => {
    const result = solveAssignment({
      requests: [
        { id: "normal", priority: "normal", createdAt: new Date() },
        { id: "urgent", priority: "urgent", createdAt: new Date() }
      ],
      providers: [{ id: "provider" }],
      travelTimes: matrix([
        ["provider", "normal", 2],
        ["provider", "urgent", 8]
      ])
    });
    assert.equal(result.assignments.length, 1);
    assert.equal(result.assignments[0].requestId, "urgent");
    assert.deepEqual(result.unassignedRequestIds, ["normal"]);
  });

  it("never invents an assignment for a missing incompatible pair", () => {
    const result = solveAssignment({
      requests: [{ id: "tow", priority: "high", createdAt: new Date() }],
      providers: [{ id: "mechanic" }],
      travelTimes: new Map()
    });
    assert.deepEqual(result.assignments, []);
    assert.deepEqual(result.unassignedRequestIds, ["tow"]);
  });

  it("matches exhaustive search across deterministic small random cases", () => {
    let seed = 20260926;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const now = new Date("2026-09-26T12:00:00Z");
    for (let scenario = 0; scenario < 30; scenario += 1) {
      const requests = [0, 1, 2].map((index) => ({ id: `R${index}`, priority: ["normal", "high", "urgent"][index], createdAt: now }));
      const providers = [0, 1, 2].map((index) => ({ id: `P${index}` }));
      const travelTimes = new Map();
      requests.forEach((request) => providers.forEach((provider) => {
        if (random() > 0.2) travelTimes.set(`${provider.id}:${request.id}`, { durationSeconds: 60 + Math.floor(random() * 1740) });
      }));

      let exhaustive = Infinity;
      function visit(requestIndex, usedProviders, cost) {
        if (requestIndex === requests.length) {
          exhaustive = Math.min(exhaustive, cost);
          return;
        }
        const request = requests[requestIndex];
        visit(requestIndex + 1, usedProviders, cost + waitingCostFor(request, now));
        providers.forEach((provider) => {
          const travel = travelTimes.get(`${provider.id}:${request.id}`);
          if (!travel || usedProviders.has(provider.id)) return;
          const weight = request.priority === "urgent" ? 4 : request.priority === "high" ? 2 : 1;
          usedProviders.add(provider.id);
          visit(requestIndex + 1, usedProviders, cost + weight * travel.durationSeconds);
          usedProviders.delete(provider.id);
        });
      }
      visit(0, new Set(), 0);
      assert.equal(solveAssignment({ requests, providers, travelTimes, now }).totalCost, exhaustive, `scenario ${scenario}`);
    }
  });
});
