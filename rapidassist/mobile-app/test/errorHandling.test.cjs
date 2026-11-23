const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const axios = require("axios");

// Exercise the actual TS modules with native/network dependencies replaced.
function load(relativePath, mocks = {}, globals = {}) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  });
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    Error, console: { ...console, warn() {} }, process, setTimeout, clearTimeout, AbortController, URLSearchParams, __DEV__: true, ...globals });
  vm.runInContext(outputText, context, { filename });
  return module.exports;
}

function loadApi({ platform = "android", dev = true, origin, localPort, hostUri, browserHost } = {}) {
  return load("src/config/api.ts", {
    "expo-constants": { expoConfig: { hostUri } },
    "react-native": { Platform: { OS: platform } }
  }, {
    __DEV__: dev,
    process: { env: { EXPO_PUBLIC_API_URL: origin, EXPO_PUBLIC_DEV_API_PORT: localPort } },
    window: browserHost ? { location: { hostname: browserHost } } : undefined
  });
}

test("shared payment presentation distinguishes confirmed cash, tests and unpaid states", () => {
  const { paymentStatusLabel, paymentStatusTone } = load("src/payments/payments.api.ts", { "../config/api": { api: {} } });
  for (const [method, status, cashCollectionRecorded, label, tone] of [
    ["cash", "paid", true, "Cash collected", "success"],
    ["cash", "paid", false, "Cash confirmation unverified", "warning"],
    ["stripe", "paid", false, "Stripe test payment succeeded", "success"],
    ["online_simulated", "paid", false, "Simulation succeeded", "success"],
    ["cash", "pending", false, "Pending", "warning"],
    ["stripe", "processing", false, "Stripe test payment: Processing", "warning"],
    ["stripe", "canceled", false, "Stripe test payment: Canceled", "warning"],
    ["online_simulated", "failed", false, "Simulation: Failed", "danger"]
  ]) {
    assert.equal(paymentStatusLabel({ method, status, cashCollectionRecorded }), label);
    assert.equal(paymentStatusTone({ method, status, cashCollectionRecorded }), tone);
  }
});

test("Android and Web request clients can preview providers with or without legacy locations", async () => {
  for (const platform of ["android", "web"]) {
    for (const legacy of [false, true]) {
      const preview = { ok: true, radiusKm: 8, providers: [{
        id: "provider", name: "Provider", ratingCount: 0,
        ...(legacy ? { location: { lat: 0, lng: 0 } } : {})
      }] };
      const requestApi = load("src/requests/requests.api.ts", { "../config/api": { api: {
        async get(url, { params, headers }) {
          assert.equal(url, "/api/requests/nearby-providers");
          assert.deepEqual({ ...params }, { category: "mechanic", lat: 0, lng: 0 });
          assert.equal(headers.Authorization, "Bearer fixture");
          return { data: preview };
        }
      } }, "react-native": { Platform: { OS: platform } } });
      assert.equal((await requestApi.listNearbyProviders("fixture", { category: "mechanic", lat: 0, lng: 0 })).providers[0].id, "provider");
    }
  }
});

test("Android and Web retain their local API defaults only during development", () => {
  assert.equal(loadApi().API_BASE_URL, "http://10.0.2.2:4000");
  assert.equal(loadApi({ hostUri: "192.168.1.2:8081" }).API_BASE_URL, "http://192.168.1.2:4000");
  assert.equal(loadApi({ platform: "web", browserHost: "local.rapidassist.test" }).API_BASE_URL, "http://local.rapidassist.test:4000");
  assert.equal(loadApi({ platform: "web", origin: "http://localhost:5000/" }).API_BASE_URL, "http://localhost:5000");
});

test("a local port override preserves emulator, USB, LAN and browser host selection", () => {
  const localPort = "4001";
  assert.equal(loadApi({ localPort }).API_BASE_URL, "http://10.0.2.2:4001");
  assert.equal(loadApi({ localPort, hostUri: "127.0.0.1:8082" }).API_BASE_URL, "http://127.0.0.1:4001");
  assert.equal(loadApi({ localPort, hostUri: "192.168.1.2:8082" }).API_BASE_URL, "http://192.168.1.2:4001");
  assert.equal(loadApi({ localPort, platform: "web", browserHost: "localhost" }).API_BASE_URL, "http://localhost:4001");
  assert.equal(loadApi({ localPort, origin: "http://localhost:4000" }).API_BASE_URL, "http://localhost:4000");
  assert.throws(() => loadApi({ localPort: "65536" }), /EXPO_PUBLIC_DEV_API_PORT/);
});

test("Android and Web release clients use the configured HTTPS origin or fail instead of falling back", () => {
  for (const platform of ["android", "web"]) {
    assert.throws(() => loadApi({ platform, dev: false }), /EXPO_PUBLIC_API_URL/);
    assert.throws(() => loadApi({ platform, dev: false, origin: "http://10.0.2.2:4000" }), /HTTPS/);
    const configured = loadApi({ platform, dev: false, origin: " https://api.rapidassist.test/ ", localPort: "4001" });
    assert.equal(configured.API_BASE_URL, "https://api.rapidassist.test");
    assert.equal(configured.api.defaults.baseURL, configured.API_BASE_URL);
  }
});

test("release origin validation rejects local, insecure, or malformed configuration", () => {
  const { validateReleaseApiOrigin } = require("../scripts/release-api-origin");
  assert.throws(() => validateReleaseApiOrigin(undefined), /EXPO_PUBLIC_API_URL is required/);
  assert.throws(() => validateReleaseApiOrigin("   "), /EXPO_PUBLIC_API_URL is required/);
  for (const value of [
    "http://api.rapidassist.test", "https://localhost", "https://10.0.2.2:4000", "https://127.1", "https://[::1]",
    "https://api.rapidassist.test/api", "https://api.rapidassist.test/?query", "https://api.rapidassist.test/#",
    "https://user@api.rapidassist.test", "https://api.rapidassist.test:99999", "https://api.rapidassist.test\\"
  ]) {
    assert.throws(() => validateReleaseApiOrigin(value), /must be a deployed HTTPS origin/, value);
  }
  assert.doesNotThrow(() => validateReleaseApiOrigin("https://api.rapidassist.test/"));
});

test("API errors preserve AxiosError metadata and give readable timeout messages", async () => {
  const { api } = loadApi();
  const error = new axios.AxiosError("timeout", "ECONNABORTED");
  let calls = 0;
  api.defaults.adapter = async () => { calls++; throw error; };
  await assert.rejects(api.post("/payment"), (received) => {
    assert.equal(received, error);
    assert.ok(axios.isAxiosError(received));
    assert.match(received.message, /timed out/);
    return true;
  });
  assert.equal(calls, 1);
});

test("canceled GET requests are never retried or relabeled", async () => {
  const { api } = loadApi();
  let calls = 0;
  api.defaults.adapter = async (config) => { calls++; throw new axios.CanceledError("Canceled by user", config); };
  await assert.rejects(api.get("/requests"), (error) => axios.isCancel(error) && error.message === "Canceled by user");
  assert.equal(calls, 1);
});

test("network GET retries are bounded and mutation requests are not retried", async () => {
  const { api } = loadApi();
  let calls = 0;
  api.defaults.adapter = async (config) => { calls++; throw new axios.AxiosError("Network Error", "ERR_NETWORK", config); };
  await assert.rejects(api.get("/requests"), /Unable to connect/);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(api.post("/requests"), /Unable to connect/);
  assert.equal(calls, 1);
});

test("server outages and HTML failures produce safe user messages", () => {
  const { getNetworkErrorMessage } = loadApi();
  assert.match(getNetworkErrorMessage({ response: { status: 503, data: { message: "private database URL" } } }), /temporarily unavailable/);
  assert.match(getNetworkErrorMessage({ response: { status: 429 } }), /wait/);
  assert.equal(getNetworkErrorMessage({ response: { status: 400, data: "<html>proxy error</html>" } }), "Request failed. Please try again.");
  assert.equal(getNetworkErrorMessage({ response: { status: 409, data: { message: "Offer expired" } } }), "Offer expired");
});

test("Google outage codes use fixed messages and never display upstream details", () => {
  const { getNetworkErrorMessage } = loadApi();
  for (const [code, message] of [
    ["GOOGLE_AUTH_NOT_CONFIGURED", /not configured/],
    ["GOOGLE_VERIFICATION_UNAVAILABLE", /cannot be verified/],
    ["AUTH_SESSION_UNAVAILABLE", /session could not be created/],
    ["DATABASE_UNAVAILABLE", /database is temporarily unavailable/]
  ]) {
    const result = getNetworkErrorMessage({ response: { status: 503, data: { code, message: "private details" } } });
    assert.match(result, message);
    assert.doesNotMatch(result, /private details/);
  }
});

test("native token storage failures reject instead of pretending to save or delete", async () => {
  const fail = async () => { throw new Error("keystore unavailable"); };
  const storage = load("src/auth/auth.storage.ts", {
    "expo-secure-store": { getItemAsync: fail, setItemAsync: fail, deleteItemAsync: fail },
    "react-native": { Platform: { OS: "android" } }
  });
  await assert.rejects(storage.getToken(), /Unable to read/);
  await assert.rejects(storage.setToken("token"), /Unable to save/);
  await assert.rejects(storage.clearToken(), /Unable to remove/);
});

test("web token storage errors are handled without falling back to a broken native module", async () => {
  const storage = load("src/auth/auth.storage.ts", {
    "expo-secure-store": {}, "react-native": { Platform: { OS: "web" } }
  }, { localStorage: { getItem() { throw new Error("denied"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("denied"); } } });
  await assert.rejects(storage.getToken(), /Unable to read/);
  await assert.rejects(storage.setToken("token"), /Unable to save/);
  await assert.rejects(storage.clearToken(), /Unable to remove/);
});

test("broken optional cache cannot reject live job operations", async () => {
  const fail = async () => { throw new Error("disk unavailable"); };
  const cache = load("src/services/requestCache.ts", {
    "@react-native-async-storage/async-storage": { getItem: fail, setItem: fail, removeItem: fail }
  });
  assert.equal(await cache.readCachedRequest("job"), null);
  await assert.doesNotReject(cache.writeCachedRequest("job", {}));
  await assert.doesNotReject(cache.removeCachedRequest("job"));
});

test("Google-sourced requests are not written to or returned from the device cache", async () => {
  const saved = JSON.stringify({ id: "job", status: "provider_assigned", category: "mechanic", estimate: { total: 5 }, pickupLocation: { lat: 1, lng: 2, source: "google_places", placeId: "test" } });
  let removed = 0;
  let writes = 0;
  const cache = load("src/services/requestCache.ts", { "@react-native-async-storage/async-storage": {
    getItem: async () => saved, setItem: async () => { writes++; }, removeItem: async () => { removed++; }
  } });
  assert.equal(await cache.readCachedRequest("job"), null);
  await cache.writeCachedRequest("job", JSON.parse(saved));
  assert.equal(writes, 0);
  assert.equal(removed, 2);
});

test("startup cleanup targets Google request caches without clearing unrelated storage", async () => {
  const records = {
    "rapidassist.activeJob.provider": JSON.stringify({ pickupLocation: { source: "google_places" } }),
    "rapidassist.customerActiveJob.customer": JSON.stringify({ request: { pickupLocation: { source: "gps" } } }),
    "other.app.data": JSON.stringify({ pickupLocation: { source: "google_places" } }),
    "rapidassist.activeJob.corrupt": "{bad"
  };
  const removed = [];
  const cache = load("src/services/requestCache.ts", { "@react-native-async-storage/async-storage": {
    getAllKeys: async () => Object.keys(records), getItem: async (key) => records[key], removeItem: async (key) => { removed.push(key); }
  } });
  await cache.cleanGoogleRequestCaches();
  assert.deepEqual(removed, ["rapidassist.activeJob.provider"]);
});

test("active location refresh updates state once and does not repeatedly retry failure", async () => {
  for (const fail of [false, true]) {
    const effects = [];
    const attempted = { current: new Set() };
    const latest = { current: null };
    let refIndex = 0;
    let calls = 0;
    let current = { id: "job", status: "provider_on_way", category: "mechanic", pickupLocation: fail
      ? { source: "google_places", placeId: "id", lat: 31, lng: 74, googleContentExpired: true }
      : { source: "google_places", placeId: "id", lat: null, lng: null } };
    const react = { useRef: () => (refIndex++ % 2 === 0 ? attempted : latest), useState: (initial) => [initial, () => {}], useCallback: (fn) => fn, useEffect: (fn) => effects.push(fn) };
    const locationPolicy = load("src/services/locationMapPolicy.ts");
    const hook = load("src/requests/useActiveLocationRefresh.ts", { react, "../services/locationMapPolicy": locationPolicy, "./requests.api": { refreshRequestLocation: async () => {
      calls++;
      if (fail) throw new Error("offline");
      return { ...current, pickupLocation: { ...current.pickupLocation, lat: 31, lng: 74, googleContentExpired: false } };
    } } });
    const setter = (update) => { current = update(current); };
    hook.useActiveLocationRefresh("token", current, setter);
    effects.splice(0).forEach((effect) => effect());
    await new Promise(setImmediate);
    assert.equal(calls, 1);
    if (!fail) assert.equal(current.pickupLocation.lat, 31);
    if (fail) assert.equal(current.pickupLocation.lat, null);
    hook.useActiveLocationRefresh("token", current, setter);
    effects.splice(0).forEach((effect) => effect());
    await new Promise(setImmediate);
    assert.equal(calls, 1);
    if (fail) assert.equal(current.pickupLocation.lat, null);
  }
});

test("active location refresh treats a successful response without coordinates as unavailable", async () => {
  const effects = [];
  const refs = [{ current: new Set() }, { current: null }];
  let refIndex = 0;
  let current = { id: "job", status: "vehicle_loaded", category: "car_towing", pickupLocation: { source: "gps", lat: 31, lng: 74 }, destinationLocation: { source: "google_places", placeId: "dropoff", lat: null, lng: null } };
  let error = null;
  const react = {
    useRef: () => refs[refIndex++],
    useState: (initial) => [initial, (value) => { if (typeof value !== "function") error = value; }],
    useCallback: (fn) => fn,
    useEffect: (fn) => effects.push(fn)
  };
  const locationPolicy = load("src/services/locationMapPolicy.ts");
  const hook = load("src/requests/useActiveLocationRefresh.ts", {
    react,
    "../services/locationMapPolicy": locationPolicy,
    "./requests.api": { refreshRequestLocation: async (_token, _id, field) => {
      assert.equal(field, "destination");
      return current;
    } }
  });
  hook.useActiveLocationRefresh("token", current, (update) => { current = update(current); });
  effects.splice(0).forEach((effect) => effect());
  await new Promise(setImmediate);
  assert.match(error, /unavailable/);
  assert.equal(current.destinationLocation.lat, null);
});

test("Google-sourced favorites are rejected before they are stored", async () => {
  let writes = 0;
  const favorites = load("src/services/favoriteLocations.storage.ts", { "expo-secure-store": {
    getItemAsync: async () => null, setItemAsync: async () => { writes++; }
  }, "react-native": { Platform: { OS: "android" } } });
  await assert.rejects(favorites.saveFavoriteLocation("customer", { addressText: "test", latitude: 1, longitude: 2, source: "google_places", placeId: "test" }), /not available/);
  assert.equal(writes, 0);
});

test("existing Google favorites retain only the place ID and require reselection", async () => {
  let raw = JSON.stringify([{ id: "g", source: "google_places", placeId: "place-id", latitude: 31, longitude: 74, addressText: "Google address", label: "Google name", savedAt: "old" }, { id: "p", source: "photon", latitude: 32, longitude: 73, addressText: "Photon", savedAt: "old" }]);
  const favorites = load("src/services/favoriteLocations.storage.ts", { "expo-secure-store": { getItemAsync: async () => raw, setItemAsync: async (_key, value) => { raw = value; } }, "react-native": { Platform: { OS: "android" } } });
  const values = await favorites.getFavoriteLocations("customer");
  assert.equal(values[0].placeId, "place-id");
  assert.equal(values[0].latitude, null);
  assert.equal(values[0].addressText, "Location unavailable");
  assert.equal(JSON.parse(raw)[0].longitude, null);
  assert.equal(values[1].latitude, 32);
});

test("corrupt cached JSON and invalid job shapes are ignored", async () => {
  for (const saved of ["{broken", "null", '"string"', '{"id":"job","status":"active"}']) {
    const cache = load("src/services/requestCache.ts", {
      "@react-native-async-storage/async-storage": { getItem: async () => saved, removeItem: async () => {} }
    });
    assert.equal(await cache.readCachedRequest("job"), null);
  }
});

test("location search handles invalid upstream data and network failure", async () => {
  const distance = load("src/utils/distance.ts");
  const mocks = { "../utils/distance": distance };
  const invalid = load("src/services/geocoding.ts", mocks, { fetch: async () => ({ ok: true, json: async () => ({ features: {} }) }) });
  await assert.rejects(invalid.searchPlaces("Lahore"), /invalid response/);
  const offline = load("src/services/geocoding.ts", mocks, { fetch: async () => { throw new Error("offline"); } });
  await assert.rejects(offline.searchPlaces("Lahore"), /offline/);
});

async function restoreSession(failure, clearFailure = false) {
  const React = require("react");
  const states = [];
  const effects = [];
  let cleared = 0;
  const provider = load("src/auth/AuthProvider.tsx", {
    react: { ...React, useRef: (current) => ({ current }), useState(initial) { const i = states.length; states.push(initial); return [initial, (next) => { states[i] = next; }]; },
      useEffect(effect) { effects.push(effect); }, useMemo(factory) { return factory(); } },
    "react-native": {},
    "./auth.storage": { getToken: async () => "saved-token", clearToken: async () => { cleared++; if (clearFailure) throw new Error("storage failed"); } },
    "./auth.api": { me: async () => { throw failure; } },
    "./sessionExpiry": load("src/auth/sessionExpiry.ts"),
    "../services/apiClient": { apiClient: { interceptors: { response: { use() {}, eject() {} } } } }
  });
  provider.AuthProvider({ children: null });
  effects.forEach((effect) => effect());
  await new Promise(setImmediate);
  return { states, cleared };
}

test("session restore keeps stored credentials during an outage and ends loading", async () => {
  const { states, cleared } = await restoreSession(new Error("offline"));
  assert.equal(cleared, 0);
  assert.equal(states[0], false);
  assert.equal(states[1], null);
  assert.equal(states[3], "offline");
});

test("session restore clears invalid credentials and handles cleanup failure", async () => {
  const invalid = { response: { status: 401 } };
  const normal = await restoreSession(invalid);
  assert.equal(normal.cleared, 1);
  assert.equal(normal.states[0], false);
  assert.equal(normal.states[3], null);
  const blocked = await restoreSession(invalid, true);
  assert.equal(blocked.states[0], false);
  assert.equal(blocked.states[3], "storage failed");
});
