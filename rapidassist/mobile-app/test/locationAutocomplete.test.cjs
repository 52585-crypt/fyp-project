const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    setTimeout,
    clearTimeout,
    AbortController,
    console,
    globalThis
  }, { filename });
  return module.exports;
}

const distance = load("src/utils/distance.ts");
const normalized = load("src/services/normalizedLocation.ts", {
  "../utils/distance": distance
});
const autocomplete = load("src/locations/locationAutocomplete.ts", {
  "../services/normalizedLocation": normalized,
  "../utils/distance": distance
});

const suggestion = (id, text) => ({ provider: "google_places", id, primaryText: text });
const wait = (milliseconds = 0) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("debounces queries and prevents a slower stale response from replacing the latest Google predictions", async () => {
  const calls = [];
  const pending = new Map();
  const states = [];
  const controller = autocomplete.createLocationAutocompleteController({
    googleEnabled: true,
    debounceMs: 5,
    createSessionToken: () => "session-token-0001",
    googleSearch(query, token) {
      calls.push({ query, token });
      return new Promise((resolve) => pending.set(query, resolve));
    },
    googleDetails: async () => { throw new Error("not used"); },
    photonSearch: async () => []
  });
  controller.subscribe((state) => states.push(state));
  controller.setQuery("Isl");
  controller.setQuery("Islam");
  await wait(10);
  assert.deepEqual(calls.map((call) => call.query), ["Islam"]);

  controller.setQuery("Islamabad");
  await wait(10);
  assert.equal(calls[0].token, calls[1].token);
  pending.get("Islamabad")([suggestion("new", "Islamabad")]);
  await wait();
  pending.get("Islam")([suggestion("old", "Islam")]);
  await wait();
  assert.equal(states.at(-1).suggestions[0].id, "new");
  controller.dispose();
});

test("reuses the session for Place Details and resets it after successful selection", async () => {
  const tokens = ["session-token-0001", "session-token-0002"];
  const searches = [];
  let detailsToken;
  const states = [];
  const controller = autocomplete.createLocationAutocompleteController({
    googleEnabled: true,
    debounceMs: 0,
    createSessionToken: () => tokens.shift(),
    googleSearch: async (query, token) => { searches.push({ query, token }); return [suggestion("place-1", "Faisal Mosque")]; },
    googleDetails: async (selected, token) => {
      detailsToken = token;
      return { latitude: 33.7294, longitude: 73.0372, address: "Faisal Mosque, Islamabad", displayName: selected.primaryText, placeId: selected.id, source: "google_places" };
    },
    photonSearch: async () => []
  });
  controller.subscribe((state) => states.push(state));
  controller.setQuery("Faisal");
  await wait(5);
  const location = await controller.select(states.at(-1).suggestions[0]);
  assert.equal(detailsToken, searches[0].token);
  assert.equal(location.source, "google_places");
  assert.equal(location.placeId, "place-1");
  assert.equal(location.latitude, 33.7294);
  controller.setQuery("Airport");
  await wait(5);
  assert.equal(searches[1].token, "session-token-0002");
  controller.dispose();
});

test("uses Photon without calling Google when Google Maps is not configured", async () => {
  let googleCalls = 0;
  const states = [];
  const controller = autocomplete.createLocationAutocompleteController({
    googleEnabled: false,
    debounceMs: 0,
    googleSearch: async () => { googleCalls++; return []; },
    googleDetails: async () => { throw new Error("not used"); },
    photonSearch: async () => [{ latitude: 31.52, longitude: 74.35, label: "Lahore, Punjab", source: "photon" }]
  });
  controller.subscribe((state) => states.push(state));
  controller.setQuery("Lahore");
  await wait(5);
  assert.equal(googleCalls, 0);
  assert.equal(states.at(-1).provider, "photon");
  const location = await controller.select(states.at(-1).suggestions[0]);
  assert.equal(location.source, "photon");
  controller.dispose();
});

test("Google destination selection updates only the towing destination", () => {
  let pickup = { latitude: 31.52, longitude: 74.35, source: "gps" };
  let destination = { latitude: 31.47, longitude: 74.27, source: "manual_map" };
  const googleDestination = { latitude: 33.61, longitude: 73.10, source: "google_places", placeId: "destination-id" };
  normalized.applyNormalizedLocationTarget("destination", googleDestination, {
    pickup: (value) => { pickup = value; },
    destination: (value) => { destination = value; }
  });
  assert.equal(pickup.source, "gps");
  assert.equal(pickup.latitude, 31.52);
  assert.equal(destination.source, "google_places");
  assert.equal(destination.placeId, "destination-id");
});

test("retry uses the latest valid pickup coordinate without receiving a press event", async () => {
  const calls = [];
  const controller = autocomplete.createLocationAutocompleteController({
    googleEnabled: true,
    debounceMs: 0,
    createSessionToken: () => "session-token-retry",
    googleSearch: async (query, token, near) => { calls.push({ query, token, near }); return []; },
    googleDetails: async () => { throw new Error("not used"); },
    photonSearch: async () => []
  });
  controller.setQuery("Islamabad", { latitude: 31.5204, longitude: 74.3587 });
  await wait(5);
  controller.retry({ latitude: 33.6844, longitude: 73.0479 });
  await wait(5);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1].near)), { latitude: 33.6844, longitude: 73.0479 });
  controller.dispose();
});

test("an invalid near bias does not suppress an otherwise valid autocomplete search", async () => {
  const calls = [];
  const controller = autocomplete.createLocationAutocompleteController({
    googleEnabled: true,
    debounceMs: 0,
    createSessionToken: () => "session-token-invalid-near",
    googleSearch: async (query, token, near) => { calls.push({ query, token, near }); return []; },
    googleDetails: async () => { throw new Error("not used"); },
    photonSearch: async () => []
  });
  controller.setQuery("Islamabad", { nativeEvent: { locationX: 10 } });
  await wait(5);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].near, undefined);
  controller.dispose();
});
