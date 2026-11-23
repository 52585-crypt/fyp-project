const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const jsxRuntime = require("react/jsx-runtime");

function loadPicker() {
  const filename = path.resolve(__dirname, "../src/components/LocationMapPickerLegacy.native.tsx");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true
    }
  }).outputText;
  const module = { exports: {} };
  const distanceFilename = path.resolve(__dirname, "../src/utils/distance.ts");
  const distanceModule = { exports: {} };
  const distanceSource = ts.transpileModule(fs.readFileSync(distanceFilename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(distanceSource, { module: distanceModule, exports: distanceModule.exports, require }, { filename: distanceFilename });
  const state = [];
  let stateIndex = 0;
  const React = {
    useEffect() {},
    useMemo(factory) { return factory(); },
    useState(initial) {
      const index = stateIndex++;
      state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (next) => {
        state[index] = typeof next === "function" ? next(state[index]) : next;
      }];
    }
  };
  const mapModule = { exports: {} };
  const mapFilename = path.resolve(__dirname, "../src/components/GoogleMap.shared.ts");
  const mapConfig = ts.transpileModule(fs.readFileSync(mapFilename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText;
  vm.runInNewContext(mapConfig, { module: mapModule, exports: mapModule.exports }, { filename: mapFilename });
  const mocks = {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@expo/vector-icons": { Ionicons: () => null },
    "react-native": {
      Modal: "Modal",
      Pressable: "Pressable",
      SafeAreaView: "SafeAreaView",
      StyleSheet: { create: (styles) => styles },
      Text: "Text",
      View: "View"
    },
    "react-native-webview": { WebView: "WebView" },
    "../theme/colors": { colors: {
      primary: "#087f5b", border: "#ddd", bg: "#fff", surface: "#fff",
      surfaceMuted: "#eee", mutedText: "#666", text: "#111", danger: "#c00",
      primarySoft: "#def", primaryDark: "#064"
    } },
    "./GoogleMap.shared": mapModule.exports,
    "./LocationMapPicker.shared": { TargetSwitch: () => null },
    "../utils/distance": distanceModule.exports,
    "./maps/legacyMapTiles": { LEGACY_MAP_TILES: {
      baseUrl: "https://tile.openstreetmap.org",
      query: "",
      attribution: "OpenStreetMap",
      usesCarto: false
    } }
  };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name)
  }, { filename });
  return { exports: module.exports, state };
}

function payload(overrides = {}) {
  return {
    pickup: { latitude: 31.52, longitude: 74.35 },
    destination: { latitude: 31.47, longitude: 74.27 },
    providers: [],
    activeTarget: "pickup",
    zoom: 13,
    tileUrl: "https://basemaps.cartocdn.com/rastertiles/voyager",
    singlePoint: false,
    pointLabel: "Service location",
    pickupLabel: "Pickup",
    destinationLabel: "Destination",
    selectedProviderId: null,
    currentLocation: null,
    center: null,
    ...overrides
  };
}

function find(element, predicate) {
  if (!element || typeof element !== "object") return null;
  if (predicate(element)) return element;
  if (typeof element.type === "function") return find(element.type(element.props), predicate);
  const children = Array.isArray(element.props?.children) ? element.props.children : [element.props?.children];
  for (const child of children) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

test("map HTML safely escapes provider data and isolates provider marker taps", () => {
  const { exports } = loadPicker();
  const malicious = "Provider </script><script>globalThis.pwned=true</script>";
  const input = payload({ providers: [{ id: "507f1f77bcf86cd799439011", name: malicious, distanceKm: 1.2, location: { latitude: 31.53, longitude: 74.36 } }] });
  const serialized = exports.serializeMapPayload(input);
  assert.equal(serialized.includes("</script>"), false);
  assert.match(serialized, /\\u003c\/script>/);
  const html = exports.buildMapHtml({ ...input, tileUrl: undefined });
  assert.equal(html.includes(malicious), false);
  assert.match(html, /providerPress/);
  assert.match(html, /event\.stopPropagation\(\)/);
  assert.match(html, /https:\/\/tile\.openstreetmap\.org/);
  assert.equal(html.includes("basemaps.cartocdn.com"), false);
  assert.match(html, /retry=/);
});

test("WebView messages accept only valid coordinates and rendered provider IDs", () => {
  const { exports } = loadPicker();
  const allowed = new Set(["provider-1"]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(exports.parseMapMessage(JSON.stringify({ type: "providerPress", providerId: "provider-1" }), allowed))),
    { type: "providerPress", providerId: "provider-1" }
  );
  assert.equal(exports.parseMapMessage(JSON.stringify({ type: "providerPress", providerId: "provider-2" }), allowed), null);
  assert.deepEqual(
    JSON.parse(JSON.stringify(exports.parseMapMessage(JSON.stringify({ type: "mapPress", target: "pickup", latitude: 31.5, longitude: 74.3 }), allowed))),
    { type: "mapPress", target: "pickup", coordinate: { latitude: 31.5, longitude: 74.3 } }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(exports.parseMapMessage(JSON.stringify({ type: "mapPress", target: "pickup", latitude: 100, longitude: 74.3 }), allowed))),
    { type: "coordinateError" }
  );
  assert.equal(exports.parseMapMessage("not-json", allowed), null);
});

test("Android map messages preserve Islamabad and negative latitude-longitude order", () => {
  const { exports } = loadPicker();
  const allowed = new Set();
  const islamabad = exports.parseMapMessage(JSON.stringify({
    type: "mapPress", target: "pickup", latitude: 33.6844, longitude: 73.0479
  }), allowed);
  assert.deepEqual(JSON.parse(JSON.stringify(islamabad.coordinate)), {
    latitude: 33.6844,
    longitude: 73.0479
  });
  const negative = exports.parseMapMessage(JSON.stringify({
    type: "mapPress", target: "pickup", latitude: -33.8688, longitude: -151.2093
  }), allowed);
  assert.deepEqual(JSON.parse(JSON.stringify(negative.coordinate)), {
    latitude: -33.8688,
    longitude: -151.2093
  });
});

test("provider selection callback is isolated from pickup selection", () => {
  const { exports } = loadPicker();
  const selected = [];
  const pickups = [];
  const destinations = [];
  const element = exports.LocationMapPicker({
    pickup: { latitude: 31.52, longitude: 74.35 },
    destination: { latitude: 31.47, longitude: 74.27 },
    providers: [{ id: "provider-1", name: "Provider", location: { latitude: 31.53, longitude: 74.36 } }],
    activeTarget: "pickup",
    onActiveTargetChange() {},
    onPickupChange: (coordinate) => pickups.push(coordinate),
    onDestinationChange: (coordinate) => destinations.push(coordinate),
    onProviderPress: (id) => selected.push(id)
  });
  const webView = find(element, (node) => node.type === "WebView");
  assert.ok(webView);
  webView.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: "providerPress", providerId: "provider-1" }) } });
  assert.deepEqual(selected, ["provider-1"]);
  assert.equal(pickups.length, 0);
  assert.equal(destinations.length, 0);
  webView.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: "mapPress", target: "pickup", latitude: 31.6, longitude: 74.4 }) } });
  assert.deepEqual(JSON.parse(JSON.stringify(pickups)), [{ latitude: 31.6, longitude: 74.4 }]);
});

test("recenter changes only viewport state and preserves booking coordinates", async () => {
  const { exports, state } = loadPicker();
  const pickup = { latitude: 31.52, longitude: 74.35 };
  const destination = { latitude: 31.47, longitude: 74.27 };
  const current = { latitude: 31.55, longitude: 74.38 };
  let pickupChanges = 0;
  let destinationChanges = 0;
  const element = exports.LocationMapPicker({
    pickup,
    destination,
    activeTarget: "pickup",
    onActiveTargetChange() {},
    onPickupChange: () => { pickupChanges += 1; },
    onDestinationChange: () => { destinationChanges += 1; },
    onRequestCurrentLocation: async () => current
  });
  const recenter = find(element, (node) => node.type === "Pressable" && node.props.accessibilityLabel === "Recenter map on current location");
  assert.ok(recenter);
  await recenter.props.onPress();
  assert.deepEqual(state[2], current);
  assert.deepEqual(state[3], current);
  assert.equal(pickupChanges, 0);
  assert.equal(destinationChanges, 0);
  assert.deepEqual(pickup, { latitude: 31.52, longitude: 74.35 });
  assert.deepEqual(destination, { latitude: 31.47, longitude: 74.27 });
});

test("failed recenter does not silently substitute the pickup coordinate", async () => {
  const { exports, state } = loadPicker();
  const element = exports.LocationMapPicker({
    pickup: { latitude: 31.52, longitude: 74.35 },
    destination: { latitude: 31.47, longitude: 74.27 },
    activeTarget: "pickup",
    onActiveTargetChange() {},
    onPickupChange() {},
    onDestinationChange() {},
    onRequestCurrentLocation: async () => null
  });
  const recenter = find(element, (node) => node.type === "Pressable" && node.props.accessibilityLabel === "Recenter map on current location");
  await recenter.props.onPress();
  assert.equal(state[2], null);
  assert.equal(state[3], null);
});

test("invalid Android map coordinates show an error and do not invoke pickup update", () => {
  const { exports } = loadPicker();
  const errors = [];
  let pickupChanges = 0;
  const element = exports.LocationMapPicker({
    pickup: { latitude: 33.6844, longitude: 73.0479 },
    destination: { latitude: 33.6844, longitude: 73.0479 },
    activeTarget: "pickup",
    onActiveTargetChange() {},
    onPickupChange: () => { pickupChanges += 1; },
    onDestinationChange() {},
    onCoordinateError: (message) => errors.push(message)
  });
  const webView = find(element, (node) => node.type === "WebView");
  webView.props.onMessage({ nativeEvent: { data: JSON.stringify({
    type: "mapPress", target: "pickup", latitude: null, longitude: null
  }) } });
  assert.equal(pickupChanges, 0);
  assert.match(errors[0], /invalid coordinates/i);
});

test("Android booking map uses the default only as camera center and omits unselected pins", () => {
  const { exports } = loadPicker();
  const html = exports.buildMapHtml(payload({ pickup: null, destination: null }));
  assert.match(html, /"pickup":null,"destination":null/);
  assert.match(html, /"initialCenter":\{"latitude":31\.5204/);
  assert.match(html, /if \(data\.pickup\) addMarker/);
  assert.match(html, /if \(!data\.singlePoint && data\.destination\) addMarker/);
});
