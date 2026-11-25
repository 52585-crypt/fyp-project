const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const React = require("react");
const ts = require("typescript");

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

function loadTypes() {
  const filename = path.resolve(__dirname, "../src/components/maps/RapidAssistMap.types.ts");
  const moduleValue = { exports: {} };
  vm.runInNewContext(transpile(filename), {
    module: moduleValue,
    exports: moduleValue.exports,
    require: (name) => /config\/serviceArea$/.test(name) ? require("./helpers/serviceArea.cjs") : require(name)
  }, { filename });
  return moduleValue.exports;
}

const mapTypes = loadTypes();

function renderNativeMap(props, options = {}) {
  const filename = path.resolve(__dirname, "../src/components/maps/RapidAssistMap.native.tsx");
  const effects = [];
  const states = options.states || [0, { state: "loading" }];
  const cameraRef = options.cameraRef || null;
  const refs = [
    { current: cameraRef },
    { current: null },
    { current: states[0] },
    { current: null }
  ];
  let stateIndex = 0;
  let refIndex = 0;
  const reactMock = {
    ...React,
    useCallback: (callback) => callback,
    useEffect: (effect) => { effects.push(effect); },
    useMemo: (factory) => factory(),
    useRef: (initial) => refs[refIndex++] || { current: initial },
    useState: (initial) => {
      const index = stateIndex++;
      if (states[index] === undefined) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next) => {
        states[index] = typeof next === "function" ? next(states[index]) : next;
      }];
    }
  };
  const native = {
    Camera: function Camera() { return null; },
    GeoJSONSource: function GeoJSONSource() { return null; },
    Layer: function Layer() { return null; },
    Map: function Map() { return null; },
    Marker: function Marker() { return null; }
  };
  const MapStatusOverlay = function MapStatusOverlay() { return null; };
  const moduleValue = { exports: {} };
  const mocks = {
    react: reactMock,
    "react-native": {
      StyleSheet: { absoluteFill: { position: "absolute" }, create: (styles) => styles },
      Text: "Text",
      View: "View"
    },
    "@maplibre/maplibre-react-native": native,
    "./MapStatusOverlay": { MapStatusOverlay },
    "./RapidAssistMap.types": mapTypes
  };
  vm.runInNewContext(transpile(filename, true), {
    module: moduleValue,
    exports: moduleValue.exports,
    require: (name) => (/design\/tokens$/.test(name) ? require("./helpers/designTokens.cjs") : Object.hasOwn(mocks, name) ? mocks[name] : require(name)),
    setTimeout,
    clearTimeout
  }, { filename });
  return {
    element: moduleValue.exports.RapidAssistMap(props),
    effects,
    states,
    native,
    MapStatusOverlay
  };
}

function findAll(element, type, results = []) {
  if (!element || typeof element !== "object") return results;
  if (element.type === type) results.push(element);
  for (const child of React.Children.toArray(element.props?.children)) findAll(child, type, results);
  return results;
}

test("Android renderer uses the installed MapLibre React Native v11 API", () => {
  const packageRoot = path.resolve(__dirname, "../node_modules/@maplibre/maplibre-react-native");
  const packageValue = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  assert.equal(packageValue.version, "11.5.1");
  const declarations = fs.readFileSync(path.join(packageRoot, "lib/typescript/module/index.d.ts"), "utf8");
  for (const api of ["Camera", "GeoJSONSource", "Layer", "Map", "Marker"]) {
    assert.match(declarations, new RegExp(`\\b${api}\\b`));
  }
});

test("Android renderer configures interaction, camera bounds, routes, markers and attribution", () => {
  const selected = [];
  const pressed = [];
  const markers = [
    { id: "customer", coordinate: { latitude: 31.52, longitude: 74.35 }, title: "Customer", label: "C", color: "#dc2626" },
    { id: "invalid", coordinate: { latitude: 131, longitude: 74 }, title: "Invalid" }
  ];
  const rendered = renderNativeMap({
    markers,
    route: {
      coordinates: [{ latitude: 31.52, longitude: 74.35 }, { latitude: 31.53, longitude: 74.36 }],
      color: "#123456",
      width: 7
    },
    camera: { initialBounds: [74.3, 31.4, 74.5, 31.6] },
    onMapPress: (coordinate) => pressed.push(coordinate),
    onMarkerPress: (marker) => selected.push(marker.id),
    testID: "android-map"
  });
  const map = findAll(rendered.element, rendered.native.Map)[0];
  assert.equal(map.props.mapStyle, "https://tiles.openfreemap.org/styles/liberty");
  assert.equal(map.props.dragPan, true);
  assert.equal(map.props.touchZoom, true);
  assert.equal(map.props.doubleTapZoom, true);
  assert.equal(map.props.doubleTapHoldZoom, true);
  assert.equal(map.props.attribution, true);
  assert.deepEqual(JSON.parse(JSON.stringify(map.props.attributionPosition)), { bottom: 4, right: 4 });
  map.props.onPress({ nativeEvent: { lngLat: [74.4, 31.5] } });
  assert.deepEqual(JSON.parse(JSON.stringify(pressed)), [{ longitude: 74.4, latitude: 31.5 }]);

  const camera = findAll(rendered.element, rendered.native.Camera)[0];
  assert.deepEqual(Array.from(camera.props.initialViewState.bounds), [74.3, 31.4, 74.5, 31.6]);
  assert.equal(camera.props.minZoom, 1);
  assert.equal(camera.props.maxZoom, 20);

  const source = findAll(rendered.element, rendered.native.GeoJSONSource)[0];
  assert.deepEqual(
    JSON.parse(JSON.stringify(source.props.data.features[0].geometry.coordinates)),
    [[74.35, 31.52], [74.36, 31.53]]
  );
  const layer = findAll(rendered.element, rendered.native.Layer)[0];
  assert.deepEqual(JSON.parse(JSON.stringify(layer.props.paint)), {
    "line-color": "#123456",
    "line-width": 7,
    "line-opacity": 0.9
  });
  assert.deepEqual(JSON.parse(JSON.stringify(layer.props.layout)), { "line-cap": "round", "line-join": "round" });

  const nativeMarkers = findAll(rendered.element, rendered.native.Marker);
  assert.equal(nativeMarkers.length, 1);
  assert.deepEqual(Array.from(nativeMarkers[0].props.lngLat), [74.35, 31.52]);
  assert.equal(nativeMarkers[0].props.accessibilityRole, "button");
  assert.equal(nativeMarkers[0].props.accessibilityLabel, "Customer");
  let propagationStopped = false;
  nativeMarkers[0].props.onPress({ stopPropagation: () => { propagationStopped = true; } });
  assert.equal(propagationStopped, true);
  assert.deepEqual(selected, ["customer"]);
});

test("Android renderer reports one load error per revision and exposes retry", () => {
  const errors = [];
  let loads = 0;
  const rendered = renderNativeMap({
    onError: (message) => errors.push(message),
    onLoad: () => { loads += 1; }
  });
  const map = findAll(rendered.element, rendered.native.Map)[0];
  const overlay = findAll(rendered.element, rendered.MapStatusOverlay)[0];
  assert.equal(overlay.props.status.state, "loading");

  map.props.onDidFailLoadingMap();
  map.props.onDidFailLoadingMap();
  assert.equal(rendered.states[1].state, "error");
  assert.match(rendered.states[1].message, /Unable to load OpenFreeMap/);
  assert.equal(errors.length, 1);

  overlay.props.onRetry();
  assert.equal(rendered.states[0], 1);
  assert.equal(rendered.states[1].state, "loading");

  map.props.onDidFinishLoadingMap();
  assert.equal(rendered.states[1].state, "ready");
  assert.equal(loads, 1);
});

test("Android renderer applies camera updates through v11 CameraRef methods", () => {
  const boundsCalls = [];
  const boundsCamera = {
    fitBounds: (...args) => boundsCalls.push(args),
    easeTo: () => { throw new Error("unexpected center camera call"); }
  };
  const bounded = renderNativeMap({
    camera: { initialBounds: [74, 31, 75, 32], durationMs: 250 }
  }, { states: [0, { state: "ready" }], cameraRef: boundsCamera });
  bounded.effects[1]();
  assert.deepEqual(Array.from(boundsCalls[0][0]), [74, 31, 75, 32]);
  assert.equal(boundsCalls[0][1].duration, 250);
  assert.equal(boundsCalls[0][1].easing, "ease");

  const centerCalls = [];
  const centerCamera = {
    fitBounds: () => { throw new Error("unexpected bounds camera call"); },
    easeTo: (options) => centerCalls.push(options)
  };
  const centered = renderNativeMap({
    camera: { center: { latitude: 31.5, longitude: 74.3 }, zoom: 15, durationMs: 300 }
  }, { states: [0, { state: "ready" }], cameraRef: centerCamera });
  centered.effects[1]();
  assert.deepEqual(Array.from(centerCalls[0].center), [74.3, 31.5]);
  assert.equal(centerCalls[0].zoom, 15);
  assert.equal(centerCalls[0].duration, 300);
});
