const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const file = path.resolve(__dirname, "../src/services/normalizedLocation.ts");
const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
const distanceFile = path.resolve(__dirname, "../src/utils/distance.ts");
const distanceCode = ts.transpileModule(fs.readFileSync(distanceFile, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const distanceMod = { exports: {} };
vm.runInNewContext(distanceCode, { module: distanceMod, exports: distanceMod.exports, require }, { filename: distanceFile });
vm.runInNewContext(code, {
  module: mod,
  exports: mod.exports,
  require: (name) => name === "../utils/distance" ? distanceMod.exports : require(name)
}, { filename: file });
const { manualMapLocation, normalizeLocation, selectedRequestLocations, toRequestLocation } = mod.exports;

test("normalizes location sources and adapts to the existing request contract", () => {
  for (const source of ["gps", "manual_map", "photon", "google_places"]) {
    const location = normalizeLocation({ latitude: 31.52, longitude: 74.35, address: " Lahore ", source });
    assert.equal(location.address, "Lahore");
    assert.equal(location.source, source);
    const payload = toRequestLocation(location);
    assert.equal(payload.lat, 31.52);
    assert.equal(payload.lng, 74.35);
    assert.equal(payload.addressText, "Lahore");
    assert.equal(payload.source, source);
    assert.equal(Object.keys(payload).length, 4);
  }
});

test("passes a Google place ID without passing the full result", () => {
  const payload = toRequestLocation(normalizeLocation({ latitude: 31, longitude: 74, source: "google_places", placeId: "place-id", displayName: "Example" }));
  assert.equal(payload.placeId, "place-id");
  assert.equal(payload.source, "google_places");
  assert.equal(payload.displayName, undefined);
});

test("rejects invalid coordinates and keeps pickup and destination independent", () => {
  assert.throws(() => normalizeLocation({ latitude: 91, longitude: 74, source: "gps" }), /Invalid/);
  assert.throws(() => normalizeLocation({ latitude: 31, longitude: NaN, source: "manual_map" }), /Invalid/);
  const pickup = normalizeLocation({ latitude: 31, longitude: 74, source: "gps" });
  const destination = normalizeLocation({ latitude: 32, longitude: 73, source: "manual_map" });
  assert.equal(toRequestLocation(pickup).lat, 31);
  assert.equal(toRequestLocation(destination).lat, 32);
});

test("manual map normalization preserves the previous pickup for invalid input", () => {
  const previous = normalizeLocation({ latitude: 33.6844, longitude: 73.0479, source: "manual_map" });
  const invalidInputs = [undefined, null, {}, { latitude: NaN, longitude: 73 }, { latitude: 33, longitude: Infinity }];
  for (const input of invalidInputs) {
    const next = manualMapLocation(input, "Selected location") || previous;
    assert.equal(next, previous);
  }
  const valid = manualMapLocation({ latitude: -33.8688, longitude: -151.2093 }, "Selected location");
  assert.equal(valid.latitude, -33.8688);
  assert.equal(valid.longitude, -151.2093);
});

test("booking payload requires a selected pickup and a separately selected towing destination", () => {
  const gps = normalizeLocation({ latitude: 33.69, longitude: 73.05, source: "gps" });
  const pinned = manualMapLocation({ latitude: 33.7, longitude: 73.06 }, "Drop-off");
  for (const category of ["mechanic", "fuel_delivery", "car_towing"]) {
    assert.equal(selectedRequestLocations(category, null, pinned), null);
  }
  for (const category of ["mechanic", "fuel_delivery"]) {
    const payload = selectedRequestLocations(category, gps, pinned);
    assert.equal(payload.pickupLocation.source, "gps");
    assert.equal(payload.destinationLocation, null);
  }
  assert.equal(selectedRequestLocations("car_towing", gps, null), null);
  assert.equal(selectedRequestLocations("car_towing", gps, pinned).destinationLocation.source, "manual_map");
});
