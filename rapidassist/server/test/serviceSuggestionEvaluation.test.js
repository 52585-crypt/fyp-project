const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadDataset, parseCsv, stratifiedSample } = require("../scripts/evaluateServiceSuggestions");
const { normalizeDatasetLabel, summarizeSuggestionEvaluation } = require("../src/ai/serviceSuggestion.metrics");

describe("service suggestion dataset evaluation", () => {
  it("loads all 1,200 examples and maps towing to the request API category", () => {
    const rows = loadDataset(path.resolve(__dirname, "../../datasets/rapidassist_service_recommendation_1200.csv"));
    assert.equal(rows.length, 1200);
    assert.equal(normalizeDatasetLabel("towing"), "car_towing");
    assert.deepEqual(
      Object.fromEntries(["mechanic", "fuel_delivery", "car_towing"].map((label) => [label, rows.filter((row) => row.expected === label).length])),
      { mechanic: 400, fuel_delivery: 400, car_towing: 400 }
    );
    const sample = stratifiedSample(rows, 30);
    assert.equal(sample.filter((row) => row.expected === "mechanic").length, 10);
    assert.equal(sample.filter((row) => row.expected === "fuel_delivery").length, 10);
    assert.equal(sample.filter((row) => row.expected === "car_towing").length, 10);
  });

  it("parses quoted CSV fields and calculates classification and latency metrics", () => {
    assert.deepEqual(parseCsv('text,label\n"Car stuck, tow it",towing\n'), [
      ["text", "label"],
      ["Car stuck, tow it", "towing"]
    ]);
    const summary = summarizeSuggestionEvaluation([
      { expected: "mechanic", predicted: "mechanic", outcome: "suggested", latencyMs: 100 },
      { expected: "fuel_delivery", predicted: null, outcome: "clarification", latencyMs: 200 },
      { expected: "car_towing", predicted: "mechanic", outcome: "suggested", latencyMs: 300 }
    ]);
    assert.equal(summary.accuracy, 0.3333);
    assert.equal(summary.clarificationFrequency, 0.3333);
    assert.equal(summary.averageLatencyMs, 200);
    assert.equal(summary.p95LatencyMs, 300);
    assert.deepEqual(summary.perClass.mechanic, { precision: 0.5, recall: 1, f1: 0.6667, support: 1 });
  });
});

