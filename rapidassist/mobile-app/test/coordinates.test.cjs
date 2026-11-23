const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const jsxRuntime = require("react/jsx-runtime");

function transpile(filename, jsx = false) {
  return ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: jsx ? ts.JsxEmit.ReactJSX : undefined,
      esModuleInterop: true
    }
  }).outputText;
}

function loadDistance() {
  const filename = path.resolve(__dirname, "../src/utils/distance.ts");
  const moduleValue = { exports: {} };
  vm.runInNewContext(transpile(filename), { module: moduleValue, exports: moduleValue.exports, require }, { filename });
  return moduleValue.exports;
}

const coordinates = loadDistance();

test("validates Islamabad, negative, out-of-range, missing and non-finite coordinates", () => {
  assert.equal(coordinates.isValidCoordinates({ latitude: 33.6844, longitude: 73.0479 }), true);
  assert.equal(coordinates.isValidCoordinates({ latitude: -33.8688, longitude: -151.2093 }), true);
  for (const value of [
    { latitude: 90.0001, longitude: 73 },
    { latitude: -90.0001, longitude: 73 },
    { latitude: 33, longitude: 180.0001 },
    { latitude: 33, longitude: -180.0001 },
    undefined,
    null,
    {},
    { latitude: NaN, longitude: 73 },
    { latitude: 33, longitude: Infinity },
    { latitude: "33.6844", longitude: 73.0479 }
  ]) assert.equal(coordinates.isValidCoordinates(value), false);
});

test("converts longitude-latitude arrays explicitly without guessing swapped objects", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(coordinates.coordinatesFromLngLat([73.0479, 33.6844]))),
    { latitude: 33.6844, longitude: 73.0479 }
  );
  assert.equal(coordinates.coordinatesFromLngLat([33.6844, 190]), null);
  assert.equal(coordinates.coordinatesFromUnknown({ lat: 33.6844, lng: 73.0479 }), null);
});

function loadWebPicker() {
  const filename = path.resolve(__dirname, "../src/components/LocationMapPickerLegacy.tsx");
  const states = [];
  let stateIndex = 0;
  const reactMock = {
    useEffect() {},
    useMemo: (factory) => factory(),
    useState(initial) {
      const index = stateIndex++;
      if (states[index] === undefined) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    }
  };
  const moduleValue = { exports: {} };
  const mapModule = { exports: {} };
  const mapFilename = path.resolve(__dirname, "../src/components/GoogleMap.shared.ts");
  const mapConfig = ts.transpileModule(fs.readFileSync(mapFilename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText;
  vm.runInNewContext(mapConfig, { module: mapModule, exports: mapModule.exports }, { filename: mapFilename });
  const mocks = {
    react: reactMock,
    "react/jsx-runtime": jsxRuntime,
    "@expo/vector-icons": { Ionicons: () => null },
    "react-native": {
      Image: "Image", Pressable: "Pressable", Text: "Text", View: "View",
      StyleSheet: { create: (styles) => styles, absoluteFillObject: {} }
    },
    "react-native-svg": { default: "Svg", Polyline: "Polyline" },
    "../design/tokens": require("./helpers/designTokens.cjs"),
    "../utils/distance": coordinates,
    "./GoogleMap.shared": mapModule.exports,
    "./LocationMapPicker.shared": { TargetSwitch: () => null },
    "./maps/legacyMapTiles": { LEGACY_MAP_TILES: { attribution: "OpenStreetMap" }, legacyMapTileUrl: () => "tile" }
  };
  vm.runInNewContext(transpile(filename, true), {
    module: moduleValue,
    exports: moduleValue.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name)
  }, { filename });
  return {
    ...moduleValue.exports,
    render(props) { stateIndex = 0; return moduleValue.exports.LocationMapPicker(props); },
    states
  };
}

function find(element, predicate) {
  if (!element || typeof element !== "object") return null;
  if (predicate(element)) return element;
  const children = Array.isArray(element.props?.children) ? element.props.children : [element.props?.children];
  for (const child of children) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

test("Expo Web map click emits the application coordinate shape and rejects an invalid event", () => {
  const picker = loadWebPicker();
  const pickups = [];
  const errors = [];
  const props = {
    pickup: { latitude: 33.6844, longitude: 73.0479 },
    destination: { latitude: 33.6844, longitude: 73.0479 },
    activeTarget: "pickup",
    singlePoint: true,
    onActiveTargetChange() {},
    onPickupChange: (value) => pickups.push(value),
    onDestinationChange() {},
    onCoordinateError: (message) => errors.push(message)
  };
  let element = picker.render(props);
  let map = find(element, (node) => node.type === "Pressable" && typeof node.props.onLayout === "function");
  map.props.onLayout({ nativeEvent: { layout: { width: 800, height: 400 } } });
  element = picker.render(props);
  map = find(element, (node) => node.type === "Pressable" && typeof node.props.onLayout === "function");
  map.props.onPress({ nativeEvent: { locationX: 400, locationY: 200 } });
  assert.ok(Math.abs(pickups[0].latitude - 33.6844) < 1e-9);
  assert.ok(Math.abs(pickups[0].longitude - 73.0479) < 1e-9);
  map.props.onPress({ nativeEvent: {} });
  assert.equal(pickups.length, 1);
  assert.match(errors[0], /invalid coordinates/i);
});

test("Expo Web map coordinates support browser offset and client coordinates", () => {
  const picker = loadWebPicker();
  const projection = { pointToCoordinate: ({ x, y }) => ({ latitude: y / 10, longitude: x / 10 }) };
  assert.deepEqual(
    JSON.parse(JSON.stringify(picker.coordinateFromMapPress({ nativeEvent: { offsetX: 120, offsetY: 80 } }, projection))),
    { latitude: 8, longitude: 12 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(picker.coordinateFromMapPress({
      nativeEvent: { clientX: 145, clientY: 105 },
      currentTarget: { getBoundingClientRect: () => ({ left: 25, top: 25 }) }
    }, projection))),
    { latitude: 8, longitude: 12 }
  );
});

test("Web booking map keeps placeholder pins out of the map until a location is selected", () => {
  const picker = loadWebPicker();
  const props = {
    pickup: null, destination: null, activeTarget: "pickup",
    onActiveTargetChange() {}, onPickupChange() {}, onDestinationChange() {}
  };
  const pickupMarker = (node) => node.props?.markerText === "P";
  const dropoffMarker = (node) => node.props?.markerText === "D";
  const initial = picker.render(props);
  assert.equal(find(initial, pickupMarker), null);
  assert.equal(find(initial, dropoffMarker), null);
  const selected = picker.render({ ...props, pickup: { latitude: 31.52, longitude: 74.35 } });
  assert.ok(find(selected, pickupMarker));
  assert.equal(find(selected, dropoffMarker), null);
});
