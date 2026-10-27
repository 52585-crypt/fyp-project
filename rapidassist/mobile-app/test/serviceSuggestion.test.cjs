const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true
    }
  });
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    console,
    process,
    setTimeout,
    clearTimeout,
    AbortController
  });
  vm.runInContext(outputText, context, { filename });
  return module.exports;
}

const mechanicSuggestion = {
  recommendedService: "mechanic",
  issueCategory: "battery",
  possibleIssue: "Battery ya starting-system ka masla ho sakta hai.",
  followUpQuestion: null,
  needsClarification: false
};

test("AI suggestion request uses the authenticated POST contract and 20 second mobile timeout", async () => {
  let received;
  const api = {
    post: async (...args) => {
      received = args;
      return { data: { ok: true, suggestion: mechanicSuggestion } };
    }
  };
  const client = load("src/ai/serviceSuggestion.api.ts", { "../config/api": { api } });
  const controller = new AbortController();
  const result = await client.requestServiceSuggestion(
    "customer-token",
    { description: "Car won't start", clarifications: [] },
    controller.signal
  );

  assert.equal(received[0], "/api/ai/service-suggestion");
  assert.equal(received[1].description, "Car won't start");
  assert.equal(received[2].headers.Authorization, "Bearer customer-token");
  assert.equal(received[2].timeout, 20_000);
  assert.equal(received[2].signal, controller.signal);
  assert.equal(result.recommendedService, "mechanic");
});

test("AI POST failure is returned once without an automatic retry", async () => {
  let calls = 0;
  const api = {
    post: async () => {
      calls += 1;
      throw { response: { status: 503 } };
    }
  };
  const client = load("src/ai/serviceSuggestion.api.ts", { "../config/api": { api } });

  await assert.rejects(
    client.requestServiceSuggestion("token", { description: "Petrol khatam ho gaya", clarifications: [] }),
    /temporarily unavailable/
  );
  assert.equal(calls, 1);
});

test("AI API errors provide specific recovery messages and retain Retry-After", () => {
  const client = load("src/ai/serviceSuggestion.api.ts", { "../config/api": { api: {} } });
  const limited = client.serviceSuggestionErrorFrom({
    response: { status: 429, headers: { "retry-after": "17" } }
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.retryAfterSeconds, 17);
  assert.match(limited.message, /17 seconds/);
  assert.match(client.serviceSuggestionErrorFrom({ response: { status: 401 } }).message, /sign in/i);
  assert.match(client.serviceSuggestionErrorFrom({ response: { status: 502 } }).message, /invalid suggestion/i);
  assert.match(client.serviceSuggestionErrorFrom({ code: "ETIMEDOUT" }).message, /timed out/i);
});

test("suggestion outcomes distinguish service, clarification, unsupported, and round limit", () => {
  const hook = load("src/ai/useServiceSuggestion.ts", {
    "./serviceSuggestion.api": { requestServiceSuggestion: async () => mechanicSuggestion }
  });
  assert.equal(hook.getSuggestionOutcome(mechanicSuggestion, 0), "suggested");
  assert.equal(hook.getSuggestionOutcome({
    recommendedService: null,
    issueCategory: null,
    possibleIssue: "More information is needed.",
    followUpQuestion: "Kya gari move ho sakti hai?",
    needsClarification: true
  }, 2), "clarification");
  assert.equal(hook.getSuggestionOutcome({
    recommendedService: null,
    issueCategory: null,
    possibleIssue: "More information is needed.",
    followUpQuestion: "Kya gari move ho sakti hai?",
    needsClarification: true
  }, 3), "unsupported");
  assert.equal(hook.getSuggestionOutcome({
    recommendedService: null,
    issueCategory: null,
    possibleIssue: "Please describe a vehicle assistance problem.",
    followUpQuestion: null,
    needsClarification: false
  }, 0), "unsupported");
});

test("accepted suggestions map only to supported booking form fields", () => {
  const integration = load("src/ai/serviceSuggestion.integration.ts");

  const mechanic = integration.selectionFromSuggestion(mechanicSuggestion);
  assert.equal(mechanic.category, "mechanic");
  assert.equal(mechanic.serviceId, "mechanic");
  assert.equal(mechanic.mechanicIssue, "battery");

  const towing = integration.selectionFromSuggestion({
    recommendedService: "car_towing",
    issueCategory: null,
    possibleIssue: "Vehicle recovery is required.",
    followUpQuestion: null,
    needsClarification: false
  });
  assert.equal(towing.category, "car_towing");
  assert.equal(towing.serviceId, "towing");
  assert.equal(towing.mechanicIssue, null);

  const fuel = integration.selectionFromSuggestion({
    recommendedService: "fuel_delivery",
    issueCategory: null,
    possibleIssue: "Fuel delivery is required.",
    followUpQuestion: null,
    needsClarification: false
  });
  assert.equal(fuel.category, "fuel_delivery");
  assert.equal(fuel.serviceId, "fuel");
  assert.equal(fuel.mechanicIssue, null);
});

test("unsupported or inconsistent AI output cannot alter booking fields", () => {
  const integration = load("src/ai/serviceSuggestion.integration.ts");
  assert.equal(integration.selectionFromSuggestion({
    recommendedService: null,
    issueCategory: null,
    possibleIssue: "Choose manually.",
    followUpQuestion: null,
    needsClarification: false
  }), null);
  assert.equal(integration.selectionFromSuggestion({
    recommendedService: "fuel_delivery",
    issueCategory: "battery",
    possibleIssue: "Invalid combination.",
    followUpQuestion: null,
    needsClarification: false
  }), null);
  assert.equal(integration.selectionFromSuggestion({
    recommendedService: "mechanic",
    issueCategory: null,
    possibleIssue: "Missing mechanic category.",
    followUpQuestion: null,
    needsClarification: false
  }), null);
});
