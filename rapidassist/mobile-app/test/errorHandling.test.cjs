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
    console: { ...console, warn() {} }, process, setTimeout, clearTimeout, AbortController, URLSearchParams, ...globals });
  vm.runInContext(outputText, context, { filename });
  return module.exports;
}

function loadApi() {
  return load("src/config/api.ts", { "expo-constants": {}, "react-native": { Platform: { OS: "android" } } });
}

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

test("corrupt cached JSON and invalid job shapes are ignored", async () => {
  for (const saved of ["{broken", "null", '"string"', '{"id":"job","status":"active"}']) {
    const cache = load("src/services/requestCache.ts", {
      "@react-native-async-storage/async-storage": { getItem: async () => saved, removeItem: async () => {} }
    });
    assert.equal(await cache.readCachedRequest("job"), null);
  }
});

test("location search handles invalid upstream data and network failure", async () => {
  const invalid = load("src/services/geocoding.ts", {}, { fetch: async () => ({ ok: true, json: async () => ({ features: {} }) }) });
  await assert.rejects(invalid.searchPlaces("Lahore"), /invalid response/);
  const offline = load("src/services/geocoding.ts", {}, { fetch: async () => { throw new Error("offline"); } });
  await assert.rejects(offline.searchPlaces("Lahore"), /offline/);
});

async function restoreSession(failure, clearFailure = false) {
  const React = require("react");
  const states = [];
  const effects = [];
  let cleared = 0;
  const provider = load("src/auth/AuthProvider.tsx", {
    react: { ...React, useState(initial) { const i = states.length; states.push(initial); return [initial, (next) => { states[i] = next; }]; },
      useEffect(effect) { effects.push(effect); }, useMemo(factory) { return factory(); } },
    "react-native": {},
    "./auth.storage": { getToken: async () => "saved-token", clearToken: async () => { cleared++; if (clearFailure) throw new Error("storage failed"); } },
    "./auth.api": { me: async () => { throw failure; } },
    "../services/apiClient": { apiClient: {} }
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
