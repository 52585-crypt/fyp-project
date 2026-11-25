const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");

const filename = path.resolve(__dirname, "../src/components/maps/RapidAssistMap.types.ts");
const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const moduleValue = { exports: {} };
vm.runInNewContext(source, { module: moduleValue, exports: moduleValue.exports, require: (name) => /config\/serviceArea$/.test(name) ? require("./helpers/serviceArea.cjs") : require(name) }, { filename });
const maps = moduleValue.exports;

function loadStatusOverlay() {
  const overlayFilename = path.resolve(__dirname, "../src/components/maps/MapStatusOverlay.tsx");
  const overlaySource = ts.transpileModule(fs.readFileSync(overlayFilename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true
    }
  }).outputText;
  const overlayModule = { exports: {} };
  const reactNative = {
    ActivityIndicator: "ActivityIndicator",
    Pressable: "Pressable",
    StyleSheet: { absoluteFillObject: {}, create: (styles) => styles },
    Text: "Text",
    View: "View"
  };
  vm.runInNewContext(overlaySource, {
    module: overlayModule,
    exports: overlayModule.exports,
    require: (name) => {
      if (/design\/tokens$/.test(name)) return require("./helpers/designTokens.cjs");
      if (name === "react") return React;
      if (name === "react-native") return reactNative;
      if (name === "../../design/tokens") return require("./helpers/designTokens.cjs");
      return require(name);
    }
  }, { filename: overlayFilename });
  return { ...overlayModule.exports, reactNative };
}

function loadFallbackWrapper(initialStates = [false, 0, null]) {
  const wrapperFilename = path.resolve(__dirname, "../src/components/maps/RapidAssistMapWithFallback.tsx");
  const wrapperSource = ts.transpileModule(fs.readFileSync(wrapperFilename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true
    }
  }).outputText;
  const states = initialStates;
  let stateIndex = 0;
  const RapidAssistMap = function RapidAssistMap() { return null; };
  const reactNative = {
    Pressable: "Pressable",
    StyleSheet: { create: (styles) => styles },
    Text: "Text",
    View: "View"
  };
  const reactMock = {
    ...React,
    useCallback: (callback) => callback,
    useState: (initial) => {
      const index = stateIndex++;
      if (states[index] === undefined) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next) => {
        states[index] = typeof next === "function" ? next(states[index]) : next;
      }];
    }
  };
  const wrapperModule = { exports: {} };
  vm.runInNewContext(wrapperSource, {
    module: wrapperModule,
    exports: wrapperModule.exports,
    require: (name) => {
      if (/design\/tokens$/.test(name)) return require("./helpers/designTokens.cjs");
      if (name === "react") return reactMock;
      if (name === "react-native") return reactNative;
      if (name === "./RapidAssistMap") return { RapidAssistMap };
      if (name === "./RapidAssistMap.types") return {};
      return require(name);
    }
  }, { filename: wrapperFilename });
  return {
    ...wrapperModule.exports,
    RapidAssistMap,
    reactNative,
    states,
    render(props) {
      stateIndex = 0;
      return wrapperModule.exports.RapidAssistMapWithFallback(props);
    }
  };
}

function findElement(element, predicate) {
  if (!element || typeof element !== "object") return null;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props?.children)) {
    const result = findElement(child, predicate);
    if (result) return result;
  }
  return null;
}

function loadLegacyTiles(cartoKey = "") {
  const tileFilename = path.resolve(__dirname, "../src/components/maps/legacyMapTiles.ts");
  const tileSource = ts.transpileModule(fs.readFileSync(tileFilename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const tileModule = { exports: {} };
  vm.runInNewContext(tileSource, {
    module: tileModule,
    exports: tileModule.exports,
    process: { env: { EXPO_PUBLIC_CARTO_BASEMAP_API_KEY: cartoKey } }
  }, { filename: tileFilename });
  return tileModule.exports;
}

test("MapLibre foundation uses OpenFreeMap without a Google Maps key", () => {
  assert.equal(maps.OPENFREEMAP_LIBERTY_STYLE, "https://tiles.openfreemap.org/styles/liberty");
  assert.equal(maps.RAPIDASSIST_MAP_CONFIG.styleUrl, maps.OPENFREEMAP_LIBERTY_STYLE);
  assert.equal(maps.OPENSTREETMAP_ATTRIBUTION.text, "© OpenStreetMap contributors");
  assert.equal(maps.OPENSTREETMAP_ATTRIBUTION.url, "https://www.openstreetmap.org/copyright");
});

test("legacy tiles use keyless CARTO Voyager (never tile.openstreetmap.org) and add the key when set", () => {
  const osm = loadLegacyTiles();
  assert.equal(osm.LEGACY_MAP_TILES.baseUrl, "https://basemaps.cartocdn.com/rastertiles/voyager");
  assert.equal(osm.LEGACY_MAP_TILES.usesCarto, true);
  assert.equal(osm.LEGACY_MAP_TILES.query, "");
  assert.equal(osm.LEGACY_MAP_TILES.attribution, "© OpenStreetMap contributors © CARTO");
  assert.equal(osm.legacyMapTileUrl(14, 11575, 6678), "https://basemaps.cartocdn.com/rastertiles/voyager/14/11575/6678.png");

  const carto = loadLegacyTiles("key with spaces");
  assert.equal(carto.LEGACY_MAP_TILES.usesCarto, true);
  assert.equal(carto.LEGACY_MAP_TILES.query, "?key=key%20with%20spaces");
});

test("Expo Web uses the required MapLibre GL JS version", () => {
  const packagePath = path.resolve(__dirname, "../node_modules/maplibre-gl/package.json");
  const packageValue = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  assert.equal(packageValue.version, "6.17.0");
  assert.equal(packageValue.module, "dist/maplibre-gl.mjs");
  assert.equal(packageValue.style, "dist/maplibre-gl.css");

  const metroConfig = fs.readFileSync(path.resolve(__dirname, "../metro.config.js"), "utf8");
  const metroTransformer = fs.readFileSync(path.resolve(__dirname, "../metro.transformer.js"), "utf8");
  const webRenderer = fs.readFileSync(path.resolve(__dirname, "../src/components/maps/RapidAssistMap.web.tsx"), "utf8");
  assert.match(metroConfig, /metro\.transformer/);
  assert.match(metroTransformer, /import\\\.meta\\\.url/);
  assert.match(webRenderer, /setWorkerUrl\(MAPLIBRE_WORKER_URL\)/);
  assert.match(webRenderer, /maplibre-gl@6\.17\.0\/dist\/maplibre-gl-worker\.mjs/);
});

test("MapLibre shared contracts always convert coordinates to longitude-latitude order", () => {
  assert.deepEqual(Array.from(maps.toLngLat({ latitude: 33.66, longitude: 73.08 })), [73.08, 33.66]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(maps.fromLngLat([73.08, 33.66]))),
    { longitude: 73.08, latitude: 33.66 }
  );
});

test("MapLibre shared contracts reject invalid markers and build valid route GeoJSON", () => {
  const markers = [
    { id: "valid", coordinate: { latitude: 31, longitude: 74 } },
    { id: "invalid", coordinate: { latitude: 131, longitude: 74 } }
  ];
  assert.equal(maps.validMarkers(markers).length, 1);
  assert.equal(maps.isMapCoordinate({ latitude: Number.NaN, longitude: 74 }), false);
  assert.equal(maps.isMapCoordinate({ latitude: 31, longitude: 181 }), false);
  const route = maps.routeFeatureCollection({ color: "#087f5b", width: 5, coordinates: [
    { latitude: 31, longitude: 74 },
    { latitude: 32, longitude: 75 }
  ] });
  assert.deepEqual(JSON.parse(JSON.stringify(route.features[0].geometry.coordinates)), [[74, 31], [75, 32]]);
  assert.deepEqual(JSON.parse(JSON.stringify(route.features[0].properties)), { color: "#087f5b", width: 5 });

  const emptyRoute = maps.routeFeatureCollection({ coordinates: [
    { latitude: Number.NaN, longitude: 74 },
    { latitude: 131, longitude: 181 }
  ] });
  assert.deepEqual(JSON.parse(JSON.stringify(emptyRoute)), { type: "FeatureCollection", features: [] });
  const defaults = maps.resolveMapCamera({}, [{ id: "", coordinate: { latitude: 200, longitude: 200 } }], null);
  assert.deepEqual(Array.from(defaults.center), [73.08, 33.66]);
  assert.equal(defaults.bounds, null);
});

test("MapLibre camera fits multiple content points but respects an explicit center", () => {
  const markers = [
    { id: "a", coordinate: { latitude: 31, longitude: 74 } },
    { id: "b", coordinate: { latitude: 32, longitude: 75 } }
  ];
  assert.deepEqual(Array.from(maps.resolveMapCamera({}, markers).bounds), [74, 31, 75, 32]);
  const explicit = maps.resolveMapCamera({ center: { latitude: 30, longitude: 73 }, zoom: 15 }, markers);
  assert.equal(explicit.bounds, null);
  assert.deepEqual(Array.from(explicit.center), [73, 30]);
  assert.equal(explicit.zoom, 15);
  const bounded = maps.resolveMapCamera({ initialBounds: [72, 29, 76, 33] }, markers);
  assert.deepEqual(Array.from(bounded.bounds), [72, 29, 76, 33]);
  const invalid = maps.resolveMapCamera({ initialBounds: [76, 33, 72, 29], padding: { top: -1, right: 0, bottom: 0, left: 0 } }, markers);
  assert.deepEqual(Array.from(invalid.bounds), [74, 31, 75, 32]);
  assert.deepEqual(JSON.parse(JSON.stringify(invalid.padding)), { top: 44, right: 44, bottom: 44, left: 44 });
});

test("Map status overlay supports shared loading, error and retry states", () => {
  const { MapStatusOverlay, reactNative } = loadStatusOverlay();
  const ready = MapStatusOverlay({ status: { state: "ready" } });
  assert.equal(ready, null);

  const loading = MapStatusOverlay({ status: { state: "loading", message: "Preparing map" } });
  const spinner = findElement(loading, (element) => element.type === reactNative.ActivityIndicator);
  assert.equal(spinner.props.accessibilityLabel, "Preparing map");

  let retries = 0;
  const error = MapStatusOverlay({ status: { state: "error", message: "Offline" }, onRetry: () => { retries += 1; } });
  const retry = findElement(error, (element) => element.type === reactNative.Pressable && element.props.accessibilityLabel === "Retry loading map");
  assert.ok(retry);
  retry.props.onPress();
  assert.equal(retries, 1);
});

test("shared map entry points keep Android and Web renderers platform-isolated", () => {
  const mapsDirectory = path.resolve(__dirname, "../src/components/maps");
  const sharedEntry = fs.readFileSync(path.join(mapsDirectory, "RapidAssistMap.tsx"), "utf8");
  const wrapper = fs.readFileSync(path.join(mapsDirectory, "RapidAssistMapWithFallback.tsx"), "utf8");
  const nativeRenderer = fs.readFileSync(path.join(mapsDirectory, "RapidAssistMap.native.tsx"), "utf8");
  const webRenderer = fs.readFileSync(path.join(mapsDirectory, "RapidAssistMap.web.tsx"), "utf8");

  assert.match(wrapper, /from ["']\.\/RapidAssistMap["']/);
  assert.doesNotMatch(sharedEntry, /@maplibre\/maplibre-react-native|maplibre-gl/);
  assert.match(nativeRenderer, /from ["']@maplibre\/maplibre-react-native["']/);
  assert.doesNotMatch(nativeRenderer, /from ["']maplibre-gl["']/);
  assert.match(webRenderer, /from ["']maplibre-gl["']/);
  assert.doesNotMatch(webRenderer, /@maplibre\/maplibre-react-native/);
});

test("shared fallback wrapper reports errors, activates legacy maps, and remounts MapLibre on retry", () => {
  const errors = [];
  let fallbackSelections = 0;
  const wrapper = loadFallbackWrapper();
  const props = {
    fallback: React.createElement("LegacyMap"),
    testID: "foundation-map",
    onError: (message) => errors.push(message),
    onFallback: () => { fallbackSelections += 1; }
  };

  let rendered = wrapper.render(props);
  let map = findElement(rendered, (element) => element.type === wrapper.RapidAssistMap);
  assert.ok(map);
  assert.equal(map.props.testID, "foundation-map");

  map.props.onError("Style failed to load");
  assert.deepEqual(errors, ["Style failed to load"]);
  assert.equal(wrapper.states[2], "Style failed to load");

  rendered = wrapper.render(props);
  map = findElement(rendered, (element) => element.type === wrapper.RapidAssistMap);
  map.props.onFallback();
  assert.equal(wrapper.states[0], true);
  assert.equal(fallbackSelections, 1);

  rendered = wrapper.render(props);
  const fallback = findElement(rendered, (element) => element.props?.testID === "foundation-map-fallback");
  assert.ok(fallback);
  const retry = findElement(rendered, (element) => element.type === wrapper.reactNative.Pressable && element.props.accessibilityLabel === "Try MapLibre again");
  assert.ok(retry);
  retry.props.onPress();
  assert.equal(wrapper.states[0], false);
  assert.equal(wrapper.states[1], 1);
  assert.equal(wrapper.states[2], null);

  rendered = wrapper.render(props);
  assert.ok(findElement(rendered, (element) => element.type === wrapper.RapidAssistMap));
});

test("isolated foundation screen demonstrates MapLibre, style failure, camera, route, and legacy modes", () => {
  const screen = fs.readFileSync(path.resolve(__dirname, "../app/(dev)/map-foundation.tsx"), "utf8");
  assert.match(screen, /RapidAssistMapWithFallback/);
  assert.match(screen, /LocationMapPreviewLegacy/);
  assert.match(screen, /Reload MapLibre/);
  assert.match(screen, /Test style error/);
  assert.match(screen, /Show legacy map/);
  assert.match(screen, /sampleRoute/);
  assert.match(screen, /onMarkerPress/);
  assert.match(screen, /setCameraMode/);
  assert.doesNotMatch(screen, /requests\.api|services\/socket|services\/routing|serviceRequest/i);
});
