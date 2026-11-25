const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function transpile(relative) {
  const filename = path.resolve(__dirname, "..", relative);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, { module, exports: module.exports, require }, { filename });
  return module.exports;
}

function loadNavigation() {
  const translate = transpile("src/i18n/translate.ts");
  const filename = path.resolve(__dirname, "../src/utils/navigation.ts");
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    module, exports: module.exports, Error,
    require: (name) => name === "react-native" ? { Linking: { openURL: async () => {} }, Platform: { OS: "android" } }
      : name === "../i18n/translate" ? translate
      : name === "../services/locationMapPolicy" ? { hasOperationalCoordinates: (l) => Number.isFinite(l?.lat) && Number.isFinite(l?.lng) }
      : require(name)
  }, { filename });
  return module.exports;
}

const pickup = { lat: 33.7104, lng: 73.0563, addressText: "Blue Area <script>", source: "gps" };

test("builds a Google Maps navigation deep link on Android, Apple Maps on iOS, and the web directions URL everywhere", () => {
  const { navigationLinks } = loadNavigation();
  const web = "https://www.google.com/maps/dir/?api=1&destination=33.710400,73.056300&travelmode=driving";
  assert.deepEqual({ ...navigationLinks(pickup, "android") }, { app: "google.navigation:q=33.710400,73.056300&mode=d", web });
  assert.deepEqual({ ...navigationLinks(pickup, "ios") }, { app: "http://maps.apple.com/?daddr=33.710400,73.056300&dirflg=d", web });
  assert.deepEqual({ ...navigationLinks(pickup, "web") }, { app: null, web });
  assert.ok(!JSON.stringify(navigationLinks(pickup, "android")).includes("Blue Area"), "coordinates only, never address text");
});

test("opens the deep link first and falls back to the web URL when no app handles it", async () => {
  const { openExternalNavigation } = loadNavigation();
  const opened = [];
  const withMaps = { openURL: async (url) => { opened.push(url); } };
  assert.match(await openExternalNavigation(pickup, withMaps, "android"), /^google\.navigation:/);
  assert.equal(opened.length, 1);

  const tried = [];
  const noMapsApp = { openURL: async (url) => { tried.push(url); if (url.startsWith("google.navigation:")) throw new Error("No Activity found"); } };
  assert.match(await openExternalNavigation(pickup, noMapsApp, "android"), /^https:\/\/www\.google\.com\/maps\/dir\//);
  assert.deepEqual(tried.map((u) => u.split(":")[0]), ["google.navigation", "https"]);

  const webOpened = [];
  await openExternalNavigation(pickup, { openURL: async (url) => { webOpened.push(url); } }, "web");
  assert.equal(webOpened.length, 1);
  assert.match(webOpened[0], /^https:/);
});

test("refuses a location without coordinates and reports when nothing can open the directions", async () => {
  const { openExternalNavigation } = loadNavigation();
  await assert.rejects(openExternalNavigation({ lat: null, lng: null, source: "google_places" }, { openURL: async () => {} }, "android"), /unavailable/);
  await assert.rejects(openExternalNavigation(pickup, { openURL: async () => { throw new Error("nope"); } }, "android"), /No maps app or browser/);
});
