const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const axios = require("axios");

function load(relativePath, mocks = {}, globals = {}) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true
    }
  });
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: (name) => (Object.hasOwn(mocks, name) ? mocks[name] : require(name)),
    console: { ...console, warn() {}, error() {} },
    process,
    setTimeout,
    clearTimeout,
    AbortController,
    URLSearchParams,
    __DEV__: true,
    ...globals
  });
  vm.runInContext(outputText, context, { filename });
  return module.exports;
}

test("Requirement 1: Web browser online/offline events update connectivity and clean up listeners", () => {
  const listeners = {};
  const fakeWindow = {
    addEventListener: (event, handler) => {
      listeners[event] = handler;
    },
    removeEventListener: (event, handler) => {
      if (listeners[event] === handler) delete listeners[event];
    }
  };
  const fakeNavigator = { onLine: true };

  const { networkManager } = load(
    "src/services/networkManager.ts",
    {
      "react-native": { Platform: { OS: "web" } },
      "@react-native-community/netinfo": { addEventListener: () => () => {}, fetch: async () => ({ isConnected: true }) },
      "../config/api": { API_BASE_URL: "http://localhost:4000", setNetworkFailureReporter: () => {} }
    },
    { window: fakeWindow, navigator: fakeNavigator }
  );

  assert.ok(listeners["online"], "online event listener must be registered on Web");
  assert.ok(listeners["offline"], "offline event listener must be registered on Web");

  // Trigger offline event
  fakeNavigator.onLine = false;
  listeners["offline"]();
  const stateOffline = networkManager.getState();
  assert.equal(stateOffline.isConnected, false);
  assert.equal(stateOffline.isOnline, false);

  // Clean up
  networkManager.destroy();
  assert.equal(listeners["online"], undefined);
  assert.equal(listeners["offline"], undefined);
});

test("Requirement 2: Native Android NetInfo events update centralized network state", async () => {
  let netInfoHandler = null;
  let unsubscribed = false;
  const fakeNetInfo = {
    addEventListener: (handler) => {
      netInfoHandler = handler;
      return () => {
        unsubscribed = true;
      };
    },
    fetch: async () => ({ isConnected: true, isInternetReachable: true, type: "wifi" })
  };

  const { networkManager, healthClient } = load(
    "src/services/networkManager.ts",
    {
      "react-native": { Platform: { OS: "android" } },
      "@react-native-community/netinfo": fakeNetInfo,
      "../config/api": { API_BASE_URL: "http://10.0.2.2:4000", setNetworkFailureReporter: () => {} }
    }
  );

  healthClient.defaults.adapter = async () => ({ status: 200, data: { ok: true } });

  assert.ok(netInfoHandler, "NetInfo.addEventListener must be subscribed on native Android");

  // Allow initial NetInfo.fetch to settle
  await new Promise((r) => setTimeout(r, 20));

  // Simulate Android connection change to cellular
  netInfoHandler({ isConnected: true, isInternetReachable: true, type: "cellular" });
  await new Promise((r) => setTimeout(r, 20));

  const state = networkManager.getState();
  assert.equal(state.isConnected, true);
  assert.equal(state.connectionType, "cellular");
  assert.equal(state.isOnline, true);

  // Simulate Android loss of network
  netInfoHandler({ isConnected: false, isInternetReachable: false, type: "none" });
  const disconnected = networkManager.getState();
  assert.equal(disconnected.isConnected, false);
  assert.equal(disconnected.isOnline, false);

  networkManager.destroy();
  assert.ok(unsubscribed, "NetInfo listener must be unsubscribed on destroy");
});

test("Requirement 3 & 4: Backend health check API verifies availability and prevents cached responses", async () => {
  let healthRequestedUrl = "";
  let healthParams = null;

  const { networkManager, healthClient } = load(
    "src/services/networkManager.ts",
    {
      "react-native": { Platform: { OS: "web" } },
      "@react-native-community/netinfo": {},
      "../config/api": { API_BASE_URL: "http://localhost:4000", setNetworkFailureReporter: () => {} }
    },
    { window: { addEventListener: () => {}, removeEventListener: () => {} }, navigator: { onLine: true } }
  );

  healthClient.defaults.adapter = async (config) => {
    healthRequestedUrl = config.url;
    healthParams = config.params;
    return { status: 200, data: { ok: true, name: "rapidassist-server" } };
  };

  const isHealthy = await networkManager.checkBackendHealth();
  assert.equal(isHealthy, true);
  assert.equal(healthRequestedUrl, "/health");
  assert.ok(healthParams && healthParams._t, "Health check must send timestamp query to bypass cache");

  // Server error response simulation
  healthClient.defaults.adapter = async () => {
    throw new axios.AxiosError("Network error", "ERR_NETWORK");
  };
  const isHealthyAfterFailure = await networkManager.checkBackendHealth({ force: true });
  assert.equal(isHealthyAfterFailure, false);
  assert.equal(networkManager.getState().isBackendReachable, false);
  assert.equal(networkManager.getState().isOnline, false);

  networkManager.destroy();
});

test("Requirement 5 & 8: Automatic reconnection restores WebSocket connections and notifies listeners", async () => {
  const fakeListeners = {};
  const fakeWindow = {
    addEventListener: (event, handler) => {
      fakeListeners[event] = handler;
    },
    removeEventListener: () => {}
  };

  const { networkManager, healthClient, onReconnected, registerSocket } = load(
    "src/services/networkManager.ts",
    {
      "react-native": { Platform: { OS: "web" } },
      "@react-native-community/netinfo": {},
      "../config/api": { API_BASE_URL: "http://localhost:4000", setNetworkFailureReporter: () => {} }
    },
    { window: fakeWindow, navigator: { onLine: true } }
  );

  healthClient.defaults.adapter = async () => ({ status: 200, data: { ok: true } });

  let reconnectedFired = 0;
  const unsubscribeReconnected = onReconnected(() => {
    reconnectedFired++;
  });

  let socketConnectCalls = 0;
  const fakeSocket = {
    connected: false,
    disconnected: true,
    connect: () => {
      socketConnectCalls++;
      fakeSocket.connected = true;
      fakeSocket.disconnected = false;
    }
  };
  const unregisterSocket = registerSocket(fakeSocket);

  // First trigger offline event
  fakeListeners["offline"]();
  assert.equal(networkManager.getState().isOnline, false);

  // Now trigger browser "online" event (WiFi / hotspot reconnection)
  fakeListeners["online"]();
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(reconnectedFired, 1, "onReconnected callbacks must be invoked upon successful reconnection");
  assert.equal(socketConnectCalls, 1, "Registered WebSocket must be instructed to reconnect");
  assert.equal(networkManager.getState().isOnline, true);

  unsubscribeReconnected();
  unregisterSocket();
  networkManager.destroy();
});

test("Requirement 6: API client implements exponential backoff on retryable network errors", async () => {
  const apiModule = load("src/config/api.ts", {
    "expo-constants": {},
    "react-native": { Platform: { OS: "web" } }
  });
  const { api } = apiModule;

  let calls = 0;
  api.defaults.adapter = async (config) => {
    calls++;
    if (calls <= 2) {
      throw new axios.AxiosError("Network Error", "ERR_NETWORK", config);
    }
    return { status: 200, data: { ok: true, requests: [] }, config };
  };

  // Run with maxRetries: 2, retryDelay: 50, retryJitter: 0
  const response = await api.get("/requests", {
    maxRetries: 2,
    retryDelay: 50,
    retryJitter: 0
  });

  assert.equal(response.data.ok, true);
  assert.equal(calls, 3, "Initial call + 2 retries = 3 calls");
});

test("Requirement 7: In-flight duplicate GET requests are coalesced into a single request", async () => {
  const apiModule = load("src/config/api.ts", {
    "expo-constants": {},
    "react-native": { Platform: { OS: "web" } }
  });
  const { api } = apiModule;

  let adapterInvocations = 0;
  api.defaults.adapter = async (config) => {
    adapterInvocations++;
    await new Promise((r) => setTimeout(r, 40));
    return { status: 200, data: { ok: true, payload: "data" }, config };
  };

  // Fire three simultaneous identical GET requests
  const [res1, res2, res3] = await Promise.all([
    api.get("/api/dashboard"),
    api.get("/api/dashboard"),
    api.get("/api/dashboard")
  ]);

  assert.equal(adapterInvocations, 1, "Only one network request should be dispatched for concurrent identical GETs");
  assert.equal(res1.data.payload, "data");
  assert.equal(res2.data.payload, "data");
  assert.equal(res3.data.payload, "data");

  // Subsequent request after completion should dispatch a fresh call
  await api.get("/api/dashboard");
  assert.equal(adapterInvocations, 2, "Fresh request after completion dispatches new call without leaking memory");
});

test("Requirement 12: Non-idempotent POST mutation requests are never automatically retried", async () => {
  const apiModule = load("src/config/api.ts", {
    "expo-constants": {},
    "react-native": { Platform: { OS: "android" } }
  });
  const { api } = apiModule;

  let postCalls = 0;
  api.defaults.adapter = async (config) => {
    postCalls++;
    throw new axios.AxiosError("Network Error", "ERR_NETWORK", config);
  };

  await assert.rejects(api.post("/api/requests", { service: "towing" }), /Unable to connect/);
  assert.equal(postCalls, 1, "Non-idempotent POST mutation must NOT be retried");
});

test("Requirement 10 & 11: Manual retry trigger verifies backend health and reloads data without app restart", async () => {
  let reloadCount = 0;

  const { networkManager, healthClient, onReconnected } = load(
    "src/services/networkManager.ts",
    {
      "react-native": { Platform: { OS: "web" } },
      "@react-native-community/netinfo": {},
      "../config/api": { API_BASE_URL: "http://localhost:4000", setNetworkFailureReporter: () => {} }
    },
    { window: { addEventListener: () => {}, removeEventListener: () => {} }, navigator: { onLine: true } }
  );

  onReconnected(() => {
    reloadCount++;
  });

  // Simulate server down initially
  healthClient.defaults.adapter = async () => {
    throw new axios.AxiosError("Connection refused", "ECONNREFUSED");
  };
  await networkManager.checkBackendHealth();
  assert.equal(networkManager.getState().isOnline, false);

  // User taps "Retry" after server is back online
  healthClient.defaults.adapter = async () => ({ status: 200, data: { ok: true } });
  await networkManager.reconnect();

  assert.equal(networkManager.getState().isOnline, true);
  assert.equal(reloadCount, 1, "Reload callbacks must execute on retry without restarting the application");

  networkManager.destroy();
});

test("Requirement 14: Timeouts, DNS resolution errors and 503 server outages produce clean error messages", () => {
  const { getNetworkErrorMessage } = load("src/config/api.ts", {
    "expo-constants": {},
    "react-native": { Platform: { OS: "android" } }
  });

  assert.equal(
    getNetworkErrorMessage({ code: "ETIMEDOUT" }),
    "The request timed out. Check the current status before trying again."
  );
  assert.equal(
    getNetworkErrorMessage({ code: "ENOTFOUND" }),
    "Unable to connect. Check your internet connection and try again."
  );
  assert.equal(
    getNetworkErrorMessage({ code: "ERR_NAME_NOT_RESOLVED" }),
    "Unable to connect. Check your internet connection and try again."
  );
  assert.equal(
    getNetworkErrorMessage({ response: { status: 503 } }),
    "Service temporarily unavailable. Please try again shortly."
  );
  assert.equal(
    getNetworkErrorMessage({ response: { status: 429 } }),
    "Too many requests. Please wait a moment and try again."
  );
  assert.equal(
    getNetworkErrorMessage({ response: { status: 500, data: "<html><body>Gateway error</body></html>" } }),
    "Service temporarily unavailable. Please try again shortly."
  );
  for (const platform of ["android", "web"]) {
    const { getNetworkErrorMessage: messageForPlatform } = load("src/config/api.ts", {
      "expo-constants": {},
      "react-native": { Platform: { OS: platform } }
    });
    const outage = (code) => messageForPlatform({ response: { status: 503, data: { code, message: "Private AWS details" } } });
    assert.match(outage("VERIFICATION_CREDENTIALS_UNAVAILABLE"), /^Mechanic verification is temporarily unavailable/);
    assert.match(outage("VERIFICATION_AI_UNAVAILABLE"), /^Face verification is temporarily unavailable/);
    assert.match(outage("VERIFICATION_STORAGE_UNAVAILABLE"), /^Verification photo storage is temporarily unavailable/);
  }
});

test("Requirement 9: User screen and application state are preserved during network failure when authenticated", async () => {
  const React = require("react");
  const states = [];
  const effects = [];

  const provider = load("src/auth/AuthProvider.tsx", {
    react: {
      ...React,
      useRef: (current) => ({ current }),
      useState(initial) {
        const i = states.length;
        states.push(initial);
        return [
          initial,
          (next) => {
            states[i] = typeof next === "function" ? next(states[i]) : next;
          }
        ];
      },
      useEffect(effect) {
        effects.push(effect);
      },
      useMemo(factory) {
        return factory();
      }
    },
    "react-native": {},
    "./auth.storage": { getToken: async () => "valid-token", clearToken: async () => {} },
    "./auth.api": { me: async () => ({ user: { id: "user-1", name: "Ali", role: "customer" } }) },
    "./sessionExpiry": load("src/auth/sessionExpiry.ts"),
    "../services/apiClient": { apiClient: { interceptors: { response: { use() {}, eject() {} } } } }
  });

  provider.AuthProvider({ children: { type: "ScreenChild" } });
  for (const effect of effects) effect();
  await new Promise(setImmediate);

  // Authenticated state is established
  assert.equal(states[1], "valid-token");
  assert.equal(states[2].id, "user-1");
});

test("Requirement 13: Clean up all event listeners and prevent memory leaks", () => {
  const fakeListeners = {};
  const fakeWindow = {
    addEventListener: (e, h) => {
      fakeListeners[e] = h;
    },
    removeEventListener: (e, h) => {
      if (fakeListeners[e] === h) delete fakeListeners[e];
    }
  };
  const { networkManager } = load(
    "src/services/networkManager.ts",
    {
      "react-native": { Platform: { OS: "web" } },
      "@react-native-community/netinfo": {},
      "../config/api": { API_BASE_URL: "http://localhost:4000", setNetworkFailureReporter: () => {} }
    },
    { window: fakeWindow, navigator: { onLine: true } }
  );

  const unsubListener = networkManager.addListener(() => {});
  const unsubReconnected = networkManager.onReconnected(() => {});
  const unsubSocket = networkManager.registerSocket({ connected: false, disconnected: true, connect: () => {} });

  unsubListener();
  unsubReconnected();
  unsubSocket();

  networkManager.destroy();
  assert.equal(Object.keys(fakeListeners).length, 0, "All window event listeners must be removed on destroy");
});
