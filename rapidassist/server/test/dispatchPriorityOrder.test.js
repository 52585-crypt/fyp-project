const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { byDispatchPriority } = require("../src/services/dispatch");

describe("batch processing order", () => {
  it("orders urgent > high > normal, then oldest first, then id (not MongoDB's alphabetical string sort)", () => {
    const at = (seconds) => new Date(Date.UTC(2026, 10, 24, 12, 0, seconds));
    const requests = [
      { _id: "a", priority: "normal", createdAt: at(0) },
      { _id: "b", priority: "high", createdAt: at(30) },
      { _id: "c", priority: "urgent", createdAt: at(50) },
      { _id: "d", priority: "high", createdAt: at(10) },
      { _id: "e", priority: "urgent", createdAt: at(50) },
      { _id: "f", priority: "normal", createdAt: at(5) }
    ];
    assert.deepEqual([...requests].sort(byDispatchPriority).map((request) => request._id), ["c", "e", "d", "b", "a", "f"]);
    // The previous `.sort({ priority: -1 })` compared strings: urgent > normal > high.
    assert.deepEqual(["normal", "high", "urgent"].sort().reverse(), ["urgent", "normal", "high"]);
  });
});
