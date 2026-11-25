const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(relativePath, mocks = {}, globals = {}) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    setTimeout,
    clearTimeout,
    AbortController,
    ...globals
  });
  vm.runInContext(outputText, context, { filename });
  return module.exports;
}

function loadRouting(fetch) {
  const distance = load("src/utils/distance.ts");
  return load("src/services/routing.ts", { "../utils/distance": distance }, { fetch });
}

function loadRoutingWithGlobals(globals) {
  const distance = load("src/utils/distance.ts");
  return load("src/services/routing.ts", { "../utils/distance": distance }, globals);
}

function response(body, ok = true) {
  return { ok, json: async () => body };
}

test("OSRM route uses longitude-latitude ordering and returns full road geometry, distance, and ETA", async () => {
  let requestedUrl = "";
  const routing = loadRouting(async (url) => {
    requestedUrl = url;
    return response({
      code: "Ok",
      routes: [{
        distance: 6450,
        duration: 780,
        geometry: {
          type: "LineString",
          coordinates: [[73.0479, 33.6844], [73.052, 33.689], [73.0612, 33.7001]]
        }
      }]
    });
  });
  const from = { latitude: 33.6844, longitude: 73.0479 };
  const to = { latitude: 33.7001, longitude: 73.0612 };
  const route = await routing.getDrivingRouteMetrics(from, to);

  assert.match(requestedUrl, /\/73\.0479,33\.6844;73\.0612,33\.7001\?/);
  assert.match(requestedUrl, /overview=full/);
  assert.match(requestedUrl, /geometries=geojson/);
  assert.match(requestedUrl, /steps=true/);
  assert.deepEqual(JSON.parse(JSON.stringify(route.coordinates)), [
    from,
    { latitude: 33.689, longitude: 73.052 },
    to
  ]);
  assert.equal(route.distanceKm, 6.45);
  assert.equal(route.durationMinutes, 13);
  assert.equal(routing.routeMatchesCoordinates(route, from, to), true);
  assert.equal(routing.routeMatchesCoordinates(route, to, from), false);
});

test("matching route requests share one in-flight OSRM call", async () => {
  let calls = 0;
  const routing = loadRouting(async () => {
    calls += 1;
    await new Promise((resolve) => setImmediate(resolve));
    return response({ code: "Ok", routes: [{ distance: 1000, duration: 120, geometry: { type: "LineString", coordinates: [[73, 33], [73.01, 33.01]] } }] });
  });
  const from = { latitude: 33, longitude: 73 };
  const to = { latitude: 33.01, longitude: 73.01 };
  const [first, second] = await Promise.all([
    routing.getDrivingRouteMetrics(from, to),
    routing.getDrivingRouteMetrics(from, to)
  ]);
  assert.equal(calls, 1);
  assert.equal(first, second);
});

test("invalid coordinates, no route, network failure, and malformed geometry never produce a straight fallback", async () => {
  const invalid = loadRouting(async () => { throw new Error("fetch should not run"); });
  await assert.rejects(
    invalid.getDrivingRouteMetrics({ latitude: 91, longitude: 73 }, { latitude: 33, longitude: 73 }),
    /invalid coordinates/
  );

  const noRoute = loadRouting(async () => response({ code: "NoRoute", routes: [] }));
  await assert.rejects(noRoute.getDrivingRouteMetrics({ latitude: 33, longitude: 73 }, { latitude: 34, longitude: 74 }), /No driving route/);

  const offline = loadRouting(async () => { throw new TypeError("offline"); });
  await assert.rejects(offline.getDrivingRouteMetrics({ latitude: 33, longitude: 73 }, { latitude: 34, longitude: 74 }), /Check your connection/);

  const malformed = loadRouting(async () => response({ code: "Ok", routes: [{ distance: 10, duration: 10, geometry: { type: "LineString", coordinates: [[73, 33]] } }] }));
  await assert.rejects(malformed.getDrivingRouteMetrics({ latitude: 33, longitude: 73 }, { latitude: 34, longitude: 74 }), /empty or invalid/);
});

test("OSRM timeout is reported without manufacturing route geometry", async () => {
  const routing = loadRoutingWithGlobals({
    setTimeout: (callback) => { queueMicrotask(callback); return 1; },
    clearTimeout() {},
    fetch: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    })
  });
  await assert.rejects(
    routing.getDrivingRouteMetrics({ latitude: 33, longitude: 73 }, { latitude: 34, longitude: 74 }),
    /timed out/
  );
});

test("both legacy production renderers draw only supplied route geometry with a white casing", () => {
  const web = fs.readFileSync(path.resolve(__dirname, "../src/components/LocationMapPickerLegacy.tsx"), "utf8");
  const android = fs.readFileSync(path.resolve(__dirname, "../src/components/LocationMapPickerLegacy.native.tsx"), "utf8");
  for (const source of [web, android]) {
    // Brand-coloured route line drawn over a white casing (both from design tokens).
    assert.match(source, /tokens\.color\.primary/);
    assert.match(source, /tokens\.color\.(surface|surfaceGlass)\b/);
    assert.doesNotMatch(source, /addRoute\(pickup, destination\)/);
  }
  assert.match(web, /<Svg width="100%" height="100%"/);
});

test("OSRM table gives one ETA per origin to one destination in a single request", async () => {
  const urls = [];
  const routing = loadRouting(async (url) => {
    urls.push(url);
    return response({ code: "Ok", durations: [[300], [null], [29]] });
  });
  const to = { latitude: 33.7, longitude: 73.05 };
  const origins = [
    { latitude: 33.72, longitude: 73.055 },
    { latitude: NaN, longitude: 73 },
    { latitude: 33.66, longitude: 73.085 },
    { latitude: 33.655, longitude: 73.075 }
  ];
  const minutes = await routing.getDrivingMinutesTo(origins, to);
  assert.equal(urls.length, 1);
  assert.equal(urls[0], "https://router.project-osrm.org/table/v1/driving/"
    + "73.055000,33.720000;73.085000,33.660000;73.075000,33.655000;73.050000,33.700000?sources=0;1;2&destinations=3&annotations=duration");
  assert.deepEqual([...minutes], [5, null, null, 1]);
});

test("OSRM table rejects on a service error and skips the request when no origin is valid", async () => {
  let calls = 0;
  const failing = loadRouting(async () => { calls++; return response({ code: "InvalidQuery" }); });
  await assert.rejects(failing.getDrivingMinutesTo([{ latitude: 33.7, longitude: 73 }], { latitude: 33.6, longitude: 73 }));
  assert.deepEqual([...(await failing.getDrivingMinutesTo([{ latitude: NaN, longitude: 1 }], { latitude: 33.6, longitude: 73 }))], [null]);
  assert.equal(calls, 1);
});
