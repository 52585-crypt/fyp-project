const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");

function loadPicker(platform, configured) {
  const filename = path.resolve(__dirname, "../src/components/LocationMapPickerGoogle.tsx");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const GoogleMapView = () => null;
  const LegacyPicker = () => null;
  const distanceFilename = path.resolve(__dirname, "../src/utils/distance.ts");
  const distanceModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(distanceFilename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { module: distanceModule, exports: distanceModule.exports, require }, { filename: distanceFilename });
  const mapModule = { exports: {} };
  const mapFilename = path.resolve(__dirname, "../src/components/GoogleMap.shared.ts");
  const mapConfig = ts.transpileModule(fs.readFileSync(mapFilename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText;
  const serviceArea = require("./helpers/serviceArea.cjs");
  vm.runInNewContext(mapConfig, {
    module: mapModule, exports: mapModule.exports,
    require: (name) => name === "../config/serviceArea" ? serviceArea : require(name)
  }, { filename: mapFilename });
  const mocks = {
    react: { ...React, useState: () => [false, () => {}] },
    "react-native": { Platform: { OS: platform }, Modal: "Modal", Pressable: "Pressable", SafeAreaView: "SafeAreaView", Text: "Text", View: "View" },
    "expo-constants": { expoConfig: { extra: { googleMapsAndroidConfigured: configured } } },
    "../services/googleMapsAvailability": { isGoogleMapConfigured: () => configured },
    "./LocationMapPickerLegacy": { LocationMapPicker: LegacyPicker },
    "./GoogleMap.shared": mapModule.exports,
    "./LocationMapPicker.shared": { TargetSwitch: () => null },
    "./GoogleMapView": { GoogleMapView },
    "../utils/distance": distanceModule.exports
  };
  const env = configured ? { EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY: "test-map-key" } : {};
  vm.runInNewContext(source, { module, exports: module.exports, process: { env }, require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name) }, { filename });
  return { Picker: module.exports.LocationMapPicker, GoogleMapView, LegacyPicker };
}

function find(element, type) {
  if (!element || typeof element !== "object") return null;
  if (element.type === type) return element;
  for (const child of React.Children.toArray(element.props?.children)) { const result = find(child, type); if (result) return result; }
  return null;
}

test("Android and Web map selection updates the active location and falls back without configuration", () => {
  for (const platform of ["android", "web"]) {
    for (const target of ["pickup", "destination"]) {
      const { Picker, GoogleMapView, LegacyPicker } = loadPicker(platform, true);
      let pickup, destination;
      const currentLocation = { latitude: 31.5, longitude: 74.4 };
      const cameraFocus = { coordinate: currentLocation, requestId: 1 };
      const props = { pickup: { latitude: 31, longitude: 74 }, destination: { latitude: 32, longitude: 75 }, currentLocation, cameraFocus, activeTarget: target, onActiveTargetChange() {}, onPickupChange: (point) => { pickup = point; }, onDestinationChange: (point) => { destination = point; } };
      const map = find(Picker(props), GoogleMapView);
      assert.ok(map, `${platform} Google map should be shown`);
      assert.equal(map.props.currentLocation, currentLocation);
      assert.equal(map.props.cameraFocus, cameraFocus);
      const point = { latitude: 33, longitude: 73 };
      map.props.onPress(point);
      assert.deepEqual(
        JSON.parse(JSON.stringify(target === "pickup" ? pickup : destination)),
        point
      );
      assert.equal(target === "pickup" ? destination : pickup, undefined);
      const unconfigured = loadPicker(platform, false);
      assert.equal(unconfigured.Picker(props).type, unconfigured.LegacyPicker);
    }
  }
});

test("native and web Google renderers implement post-mount GPS camera movement and a current marker", () => {
  const native = fs.readFileSync(path.resolve(__dirname, "../src/components/GoogleMapView.native.tsx"), "utf8");
  const web = fs.readFileSync(path.resolve(__dirname, "../src/components/GoogleMapView.web.tsx"), "utf8");
  assert.match(native, /cameraFocus[\s\S]*animateToRegion/);
  assert.match(native, /currentLocation[\s\S]*Your current location/);
  assert.match(web, /cameraFocus[\s\S]*panTo/);
  assert.match(web, /cameraFocus[\s\S]*setZoom/);
  assert.match(web, /currentLocation[\s\S]*Your current location/);
});
