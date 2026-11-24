const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { matchingExplanation } = require("../src/services/matchingExplanation");

const base = {
  priority: "urgent", travelDurationSeconds: 1080, routeSource: "haversine_fallback",
  components: { proximity: 0.06, rating: 0.9, experience: 0.4, responseSpeed: 0.5 }
};

describe("admin matching explanation", () => {
  it("describes smart offers by their real pair cost and terms, not the legacy score", () => {
    const text = matchingExplanation({
      ...base, algorithmVersion: "smart-hungarian-v1",
      costBreakdown: { E: 93.75, Q: 25, A: 50, S: 50, F: 0, T: 50, pairCost: 46.875 }
    });
    assert.equal(text, "Selected by smart matching (Hungarian assignment per service category; priority first, then lowest cost) "
      + "with urgent priority and 18-minute travel time (haversine_fallback). Pair cost 46.9/100, lower is better: ETA 93.8, "
      + "rating 25, acceptance 50, response time 50, recent workload 0, wait/urgency 50.");
    assert.doesNotMatch(text, /proximity|experience/);
  });

  it("keeps the existing wording for the batch optimizer and older weighted offers unchanged", () => {
    assert.equal(matchingExplanation({ ...base, algorithmVersion: "batch-mincost-v1" }),
      "Selected by the batch optimizer using urgent priority and 18-minute travel time (haversine_fallback).");
    assert.equal(matchingExplanation({ ...base, algorithmVersion: "weighted-v2" }),
      "Selected using proximity 6%, adjusted rating 90%, experience 40%, and response speed 50%.");
  });

  it("falls back safely for a smart offer missing its breakdown", () => {
    assert.match(matchingExplanation({ ...base, algorithmVersion: "smart-hungarian-v1" }), /^Selected using proximity/);
  });
});
