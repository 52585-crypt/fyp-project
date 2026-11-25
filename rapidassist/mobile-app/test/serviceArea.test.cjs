const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../src", file), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => mocks[name] ?? require(name), module, module.exports);
  return module.exports;
}

const area = load("config/serviceArea.ts");

test("every quick-pick landmark is inside the twin-cities service area, with unique ids", () => {
  const { TWIN_CITY_LANDMARKS } = load("config/twinCityLandmarks.ts");
  assert.equal(TWIN_CITY_LANDMARKS.length, 12);
  assert.equal(new Set(TWIN_CITY_LANDMARKS.map((l) => l.id)).size, 12);
  for (const l of TWIN_CITY_LANDMARKS) {
    assert.ok(area.isInServiceArea(l.latitude, l.longitude), `${l.label} is outside the service area`);
    assert.ok(area.CITIES.includes(l.city));
  }
  assert.equal(area.isInServiceArea(31.5204, 74.3587), false, "Lahore is outside");
  assert.equal(area.SERVICE_AREA_BBOX_PARAM, "72.8,33.4,73.3,33.8");
});

function photon(features, calls) {
  const distance = load("utils/distance.ts");
  const geocoding = load("services/geocoding.ts", { "../config/serviceArea": area, "../utils/distance": distance });
  global.fetch = async (url) => {
    calls.push(new URL(url));
    return { ok: true, json: async () => ({ features }) };
  };
  return geocoding;
}

test("Photon search is limited to the twin cities and biased to the area centre when the user is unknown", async () => {
  const calls = [];
  const features = [
    { geometry: { coordinates: [73.06517, 33.61386] }, properties: { name: "Committee Chowk", city: "Rawalpindi" } },
    { geometry: { coordinates: [74.3587, 31.5204] }, properties: { name: "Gulberg", city: "Lahore" } }
  ];
  const { searchPlaces } = photon(features, calls);
  const results = await searchPlaces("chowk");
  assert.deepEqual(results.map((r) => r.label), ["Committee Chowk, Rawalpindi"], "results outside the area are dropped");
  const params = calls[0].searchParams;
  assert.equal(params.get("bbox"), "72.8,33.4,73.3,33.8");
  assert.equal(params.get("lat"), "33.66");
  assert.equal(params.get("lon"), "73.08");

  await searchPlaces("chowk", { latitude: 33.7, longitude: 73.05 });
  assert.equal(calls[1].searchParams.get("lat"), "33.7", "the user's real location wins over the default");
});
