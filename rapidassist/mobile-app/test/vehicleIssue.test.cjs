const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(mocks) {
  const source = fs.readFileSync(path.join(__dirname, "../src/ai/vehicleIssue.api.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => mocks[name] ?? require(name), module, module.exports);
  return module.exports;
}

const result = (overrides) => ({ detected: true, category: "car_towing", issueType: null, title: "Accident damage - towing needed",
  confidence: 0.65, top: [], ...overrides });

test("posts the photo to the free CLIP endpoint with the customer's token", async () => {
  const calls = [];
  const { detectVehicleIssue } = load({ "../config/api": {
    api: { post: async (...args) => { calls.push(args); return { data: { ok: true, result: result() } }; } },
    getNetworkErrorMessage: () => "network"
  } });
  assert.deepEqual(await detectVehicleIssue("customer-token", "data:image/jpeg;base64,/9j/"), result());
  assert.deepEqual(calls, [["/api/ai/vehicle-issue", { image: "data:image/jpeg;base64,/9j/" },
    { headers: { Authorization: "Bearer customer-token" }, timeout: 30_000 }]]);
});

test("pre-selects only a detected service, with the mechanic issue for mechanic jobs", () => {
  const { selectionFromVehicleIssue } = load({ "../config/api": { api: {}, getNetworkErrorMessage: () => "" } });
  assert.deepEqual(selectionFromVehicleIssue(result()), { category: "car_towing", serviceId: "towing", mechanicIssue: null });
  assert.deepEqual(selectionFromVehicleIssue(result({ category: "mechanic", issueType: "tyre" })),
    { category: "mechanic", serviceId: "mechanic", mechanicIssue: "tyre" });
  assert.deepEqual(selectionFromVehicleIssue(result({ category: "fuel_delivery", issueType: "tyre" })),
    { category: "fuel_delivery", serviceId: "fuel", mechanicIssue: null }, "an issue type is never applied to non-mechanic jobs");
  assert.equal(selectionFromVehicleIssue(result({ detected: false, category: null, title: "Not a vehicle photo" })), null);
  assert.equal(selectionFromVehicleIssue(result({ category: "space_travel" })), null);
  assert.equal(selectionFromVehicleIssue(null), null);
});

test("explains failures in plain language", () => {
  const { vehicleIssueErrorMessage } = load({ "../config/api": { api: {}, getNetworkErrorMessage: () => "Network unavailable" } });
  assert.match(vehicleIssueErrorMessage({ response: { status: 401 } }), /Sign in again/);
  assert.match(vehicleIssueErrorMessage({ response: { status: 403 } }), /customer accounts/);
  assert.match(vehicleIssueErrorMessage({ response: { status: 429 } }), /Too many/);
  assert.equal(vehicleIssueErrorMessage({ response: { status: 400, data: { message: "image must be a base64 data:image/... URI" } } }),
    "image must be a base64 data:image/... URI");
  assert.equal(vehicleIssueErrorMessage(new Error("offline")), "Network unavailable");
});
