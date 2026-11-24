// Keeps scripts/benchmark-matching.js runnable and honest: a quick run must succeed, be deterministic apart from
// timings, never produce an invalid assignment, and the smart Hungarian must reach the maximum possible matches.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { gini, percentile } = require("../scripts/benchmark-matching");

const SCRIPT = path.join(__dirname, "..", "scripts", "benchmark-matching.js");
const withoutTimings = (rows) => JSON.stringify(rows, (key, value) => (/Ms$/.test(key) ? undefined : value));

function quickRun() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-matching-"));
  const result = spawnSync(process.execPath, [SCRIPT, "--quick", `--out=${dir}`], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const read = (file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  const output = { singleBatch: read("single-batch.json"), runtime: read("runtime.json"), simulation: read("simulation.json"), dir };
  for (const file of ["environment.json", "single-batch.csv", "runtime.csv", "simulation.csv", "summary.md", "sensitivity.json", "sensitivity.csv", "sensitivity-summary.md"]) {
    assert.ok(fs.existsSync(path.join(dir, file)), file);
  }
  return output;
}

describe("matching benchmark (quick mode)", () => {
  it("runs, is deterministic apart from timings, and the smart Hungarian always reaches the maximum matches", () => {
    const first = quickRun();
    const second = quickRun();
    assert.equal(withoutTimings(first.singleBatch), withoutTimings(second.singleBatch));
    assert.equal(withoutTimings(first.simulation), withoutTimings(second.simulation));
    const approaches = new Set(first.singleBatch.map((row) => row.approach));
    assert.deepEqual([...approaches], ["nearest-first", "greedy-cost", "existing-mcf", "smart-hungarian"]);
    for (const row of first.singleBatch) {
      assert.ok(row.matched <= row.maxPossibleMatches, `${row.case} ${row.approach}`);
      if (row.approach === "smart-hungarian") assert.equal(row.matched, row.maxPossibleMatches, row.case);
    }
    for (const dir of [first.dir, second.dir]) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("computes Gini and nearest-rank percentiles correctly", () => {
    assert.equal(gini([1, 1, 1, 1]), 0);
    assert.ok(Math.abs(gini([0, 0, 0, 4]) - 0.75) < 1e-12);
    assert.equal(percentile([5, 1, 4, 2, 3], 50), 3);
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
    assert.equal(percentile([], 90), null);
  });
});
