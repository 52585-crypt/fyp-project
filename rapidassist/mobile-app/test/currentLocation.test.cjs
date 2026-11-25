const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadCurrentLocation() {
  const filename = path.resolve(__dirname, "../src/services/currentLocation.ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const moduleValue = { exports: {} };
  const distanceFilename = path.resolve(__dirname, "../src/utils/distance.ts");
  const distanceSource = ts.transpileModule(fs.readFileSync(distanceFilename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const distanceModule = { exports: {} };
  vm.runInNewContext(distanceSource, { module: distanceModule, exports: distanceModule.exports, require }, { filename: distanceFilename });
  vm.runInNewContext(source, {
    module: moduleValue,
    exports: moduleValue.exports,
    require: (name) => name === "expo-location"
      ? { Accuracy: { High: 6 } }
      : name === "../utils/distance" ? distanceModule.exports : require(name),
    setTimeout,
    clearTimeout
  }, { filename });
  return moduleValue.exports;
}

function api(overrides = {}) {
  return {
    getForegroundPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    requestForegroundPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    hasServicesEnabledAsync: async () => true,
    getCurrentPositionAsync: async () => ({
      coords: { latitude: 31.5204, longitude: 74.3587, accuracy: 12 }
    }),
    ...overrides
  };
}

test("uses an existing foreground permission and returns validated GPS coordinates", async () => {
  const location = loadCurrentLocation();
  let requests = 0;
  let receivedOptions;
  const result = await location.getCurrentForegroundLocation(api({
    requestForegroundPermissionsAsync: async () => { requests += 1; return { granted: true }; },
    getCurrentPositionAsync: async (options) => {
      receivedOptions = options;
      return { coords: { latitude: 31.5204, longitude: 74.3587, accuracy: 8 } };
    }
  }));
  assert.equal(requests, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    coordinate: { latitude: 31.5204, longitude: 74.3587 },
    accuracyMeters: 8
  });
  assert.equal(receivedOptions.accuracy, 6);
  assert.equal(receivedOptions.mayShowUserSettingsDialog, true);
  assert.equal(receivedOptions.maximumAge, 0);
  assert.equal(receivedOptions.timeout, 15000);
});

test("requests foreground permission when needed and reports denial", async () => {
  const location = loadCurrentLocation();
  let requests = 0;
  const result = await location.getCurrentForegroundLocation(api({
    getForegroundPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
    requestForegroundPermissionsAsync: async () => { requests += 1; return { granted: true }; }
  }));
  assert.equal(requests, 1);
  assert.equal(result.coordinate.latitude, 31.5204);

  await assert.rejects(
    location.getCurrentForegroundLocation(api({
      getForegroundPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
      requestForegroundPermissionsAsync: async () => ({ granted: false, canAskAgain: false })
    })),
    /permission was denied/i
  );
});

test("reports disabled services, invalid coordinates and poor GPS accuracy", async () => {
  const location = loadCurrentLocation();
  await assert.rejects(
    location.getCurrentForegroundLocation(api({ hasServicesEnabledAsync: async () => false })),
    /services are disabled or unavailable/i
  );
  await assert.rejects(
    location.getCurrentForegroundLocation(api({
      getCurrentPositionAsync: async () => ({ coords: { latitude: 131, longitude: 74, accuracy: 10 } })
    })),
    /invalid coordinates/i
  );
  await assert.rejects(
    location.getCurrentForegroundLocation(api({
      getCurrentPositionAsync: async () => ({ coords: { latitude: 31, longitude: 74, accuracy: 2501 } })
    })),
    /too imprecise/i
  );
});

test("times out a stalled location request and maps browser-unavailable errors", async () => {
  const location = loadCurrentLocation();
  await assert.rejects(
    location.getCurrentForegroundLocation(api({ getCurrentPositionAsync: async () => new Promise(() => {}) }), 5),
    /timed out/i
  );
  await assert.rejects(
    location.getCurrentForegroundLocation(api({
      getCurrentPositionAsync: async () => { throw { code: 2, message: "Position unavailable" }; }
    })),
    /current location is unavailable/i
  );
});

test("treats a fix worse than 100 m as approximate, and a missing or precise fix as not", () => {
  const { isApproximateFix, APPROXIMATE_ACCURACY_METERS } = loadCurrentLocation();
  assert.equal(APPROXIMATE_ACCURACY_METERS, 100);
  assert.equal(isApproximateFix(25), false);
  assert.equal(isApproximateFix(100), false);
  assert.equal(isApproximateFix(101), true);
  assert.equal(isApproximateFix(1800), true);
  assert.equal(isApproximateFix(null), false);
  assert.equal(isApproximateFix(undefined), false);
  assert.equal(isApproximateFix(NaN), false);
});
