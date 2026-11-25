#!/usr/bin/env node
/** Regression check: lists use cases that PASSED in the baseline run but do not pass now. Matched by area + use case. */
const [base, now] = process.argv.slice(2).map((f) => require(require("node:path").resolve(f)));
const key = (r) => `${r.area} :: ${r.useCase}`;
const current = new Map(now.results.map((r) => [key(r), r]));
const regressions = base.results.filter((r) => r.result === "PASS" && current.get(key(r))?.result !== "PASS");
const fixed = base.results.filter((r) => r.result === "FAIL" && current.get(key(r))?.result === "PASS");
console.log(`baseline ${JSON.stringify(base.summary)} -> now ${JSON.stringify(now.summary)}`);
console.log(`newly passing: ${fixed.map(key).join("; ") || "none"}`);
if (regressions.length) {
  console.log(`REGRESSIONS (${regressions.length}):`);
  for (const r of regressions) console.log(` - ${key(r)} -> ${current.get(key(r))?.actual ?? "missing"}`);
  process.exit(1);
}
console.log("no regressions");
