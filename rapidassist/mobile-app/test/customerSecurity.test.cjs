const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, mocks = {}, globals = {}) {
  const filename = path.resolve(__dirname, "..", file);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    Error, module, exports: module.exports, ...globals,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name)
  }, { filename });
  return module.exports;
}

const requestId = load("src/requests/requestId.ts");
const navigation = load("src/auth/customerNavigation.ts", { "../requests/requestId": requestId });
const firstId = "a".repeat(24);
const otherId = "b".repeat(24);
const customer = { id: "account-a", role: "user", phone: "registered" };
const provider = { id: "mechanic", role: "mechanic", phone: "registered" };
const legacyKey = "rapidassist.favoriteLocations";

for (const platform of ["android", "web"]) {
  test(`${platform} favorites only read and write authenticated account keys`, async () => {
    const location = { addressText: "Customer pickup", latitude: 1, longitude: 2, source: "gps" };
    const data = new Map([[legacyKey, JSON.stringify([{ ...location, id: "unowned" }])]]);
    const storage = {
      getItem: (key) => { assert.notEqual(key, legacyKey); return data.get(key) ?? null; },
      setItem: (key, value) => { assert.notEqual(key, legacyKey); data.set(key, value); }
    };
    const api = load("src/services/favoriteLocations.storage.ts", {
      "react-native": { Platform: { OS: platform } },
      "expo-secure-store": platform === "android"
        ? { getItemAsync: storage.getItem, setItemAsync: storage.setItem } : {}
    }, platform === "web" ? { localStorage: storage } : {});
    await assert.rejects(api.getFavoriteLocations(undefined), /Sign in/);
    assert.equal((await api.getFavoriteLocations(customer.id)).length, 0);
    const [saved] = await api.saveFavoriteLocation(customer.id, location);
    assert.equal((await api.getFavoriteLocations("account-b")).length, 0);
    await api.deleteFavoriteLocation("account-b", saved.id);
    assert.equal((await api.getFavoriteLocations(customer.id))[0].addressText, location.addressText);
    assert.ok(data.has(legacyKey));
  });
}

test("late favorite reads and saves cannot repopulate state after logout or account switch", async () => {
  const pending = [];
  function defer() {
    return new Promise((resolve) => pending.push(resolve));
  }
  const state = [], memo = [], effects = [];
  let currentAuth = { token: "token-a", user: customer };
  let stateIndex, memoIndex, effectIndex;
  const react = {
    useState(initial) {
      const i = stateIndex++;
      if (!(i in state)) state[i] = initial;
      return [state[i], (value) => { state[i] = value; }];
    },
    useMemo(factory, key) {
      const i = memoIndex++;
      if (!memo[i] || key.some((value, j) => memo[i].key[j] !== value)) memo[i] = { key, value: factory() };
      return memo[i].value;
    },
    useRef(initial) { return react.useMemo(() => ({ current: initial }), []); },
    useEffect(effect, dependencies) {
      const i = effectIndex++;
      if (effects[i]?.dependencies[0] === dependencies[0]) return;
      effects[i]?.clean?.();
      effects[i] = { dependencies, clean: effect() };
    }
  };
  const { useFavoriteLocations } = load("src/services/useFavoriteLocations.ts", {
    react,
    "../auth/AuthProvider": { useAuth: () => currentAuth },
    "./favoriteLocations.storage": {
      getFavoriteLocations: (id) => id === customer.id ? defer() : Promise.resolve([]),
      saveFavoriteLocation: defer
    }
  });
  function render() {
    stateIndex = memoIndex = effectIndex = 0;
    return useFavoriteLocations(assert.fail);
  }
  const saving = render().saveFavorite({});
  currentAuth = { token: null, user: null };
  assert.equal(render().favoriteLocations.length, 0);
  currentAuth = { token: "token-b", user: { id: "account-b" } };
  assert.equal(render().favoriteLocations.length, 0);
  pending.forEach((resolve) => resolve([{ id: "private" }]));
  await saving;
  await Promise.resolve();
  assert.equal(render().favoriteLocations.length, 0);
  assert.equal(render().favoriteSaving, false);
});

test("customer layout waits for restoration and protects booking before login", () => {
  let session = { isLoading: true, token: null, user: null };
  const { default: Layout } = load("app/(user)/_layout.tsx", {
    react: { useRef: (current) => ({ current }) },
    "@react-navigation/native": { useRoute: () => ({ params: { screen: "request/index",
      params: { category: "fuel_delivery" } } }) },
    "expo-router": { Redirect: "Redirect", Stack: "Stack", usePathname: () => "/request",
      useGlobalSearchParams: () => ({}) },
    "../../src/auth/AuthProvider": { useAuth: () => session },
    "../../src/auth/customerNavigation": navigation
  });
  assert.equal(Layout(), null);
  session = { ...session, isLoading: false };
  assert.equal(Layout().props.href.pathname, "/(auth)/login");
  assert.equal(Layout().props.href.params.returnTo, "/request?category=fuel_delivery");
  session = { ...session, token: "customer", user: customer };
  assert.equal(Layout().type, "Stack");
  session = { ...session, token: "provider", user: provider };
  assert.equal(Layout().props.href, "/(provider)/dashboard");
});

test("login can resume known customer routes and resolves legacy links by the authenticated role", () => {
  for (const path of ["/payment/" + firstId, "/chat/" + firstId, "/profile", "/notifications"]) {
    assert.equal(navigation.resumeAfterSignIn(customer, path), "/(user)/customer" + path);
    assert.equal(navigation.resumeAfterSignIn(provider, path), "/(provider)" + path);
  }
  assert.equal(navigation.resumeAfterSignIn(customer, "/request?category=fuel_delivery"), "/request?category=fuel_delivery");
  assert.equal(navigation.resumeAfterSignIn(customer, "/customer/payment/" + firstId), "/customer/payment/" + firstId);
  assert.equal(navigation.resumeAfterSignIn(provider, "/customer/payment/" + firstId), null);
  assert.equal(navigation.resumeAfterSignIn(customer, "/tracking?requestId=" + firstId), "/tracking?requestId=" + firstId);
  assert.equal(navigation.resumeAfterSignIn(customer, "/tracking?requestId=invalid"), "/tracking?requestId=invalid");
  assert.equal(navigation.resumeAfterSignIn(customer, "/tracking?requestId=%"), "/tracking?requestId=invalid");
  assert.equal(navigation.resumeAfterSignIn({ ...customer, phone: null }, "/profile").params.returnTo, "/customer/profile");
  for (const value of ["/login", "/(provider)/dashboard", "//evil.example", "https://evil.example", "/%2f%2fevil.example", ["/tracking"]]) {
    assert.equal(navigation.resumeAfterSignIn(customer, value), null);
  }
});

test("only a 401 from the current customer bearer session invalidates it", () => {
  const { isExpiredCustomerSession } = load("src/auth/sessionExpiry.ts");
  const session = { token: "current", role: "user" };
  const failure = (status, token) => ({
    response: { status }, config: { headers: { get: () => token && "Bearer " + token } }
  });
  assert.equal(isExpiredCustomerSession(failure(401, "current"), session), true);
  assert.equal(isExpiredCustomerSession(failure(401, "previous"), session), false);
  assert.equal(isExpiredCustomerSession(failure(401), session), false);
  assert.equal(isExpiredCustomerSession(failure(403, "current"), session), false);
  assert.equal(isExpiredCustomerSession(failure(401, "current"), { ...session, role: "mechanic" }), false);
});

test("tracking notifications retain their request ID and malformed links stay explicit", () => {
  const { notificationDestination } = load("src/notifications/notificationDestination.ts", { "../requests/requestId": requestId });
  for (const [route, expectedPath] of [
    ["/(user)/tracking", "/(user)/tracking"],
    ["/(user)/chat", "/(user)/customer/chat/[requestId]"],
    ["/(user)/payment", "/(user)/customer/payment/[requestId]"],
    ["/(provider)/payment", "/(provider)/payment/[requestId]"]
  ]) {
    const destination = notificationDestination({ route, requestId: firstId.toUpperCase() });
    assert.equal(destination.pathname, expectedPath);
    assert.equal(destination.params.requestId, firstId);
  }
  assert.equal(notificationDestination({ route: "/(user)/tracking" }).params.requestId, "invalid");
  assert.equal(notificationDestination({ route: "/(user)/tracking", requestId: "bad" }).params.requestId, "invalid");
});

test("Activity prefers a current account's active request and explicit requests require matching ID and owner", () => {
  const { selectActiveCustomerRequest, verifiedCustomerRequest } = load("src/requests/customerTrackingSelection.ts");
  const complete = { id: firstId, userId: customer.id, status: "completed" };
  const cancelled = { id: otherId, userId: customer.id, status: "cancelled" };
  const foreign = { id: firstId, userId: "account-b", status: "provider_on_way" };
  const active = { id: otherId, userId: customer.id, status: "provider_on_way" };
  assert.equal(selectActiveCustomerRequest([complete, cancelled, foreign, active], customer.id), active);
  assert.equal(selectActiveCustomerRequest([complete, cancelled, foreign], customer.id), null);
  assert.equal(verifiedCustomerRequest(complete, firstId, customer.id), complete);
  assert.equal(verifiedCustomerRequest(foreign, firstId, customer.id), null);
  assert.equal(verifiedCustomerRequest(active, firstId, customer.id), null);
});

test("native Stripe callbacks stay with Stripe and other app URLs are preserved", () => {
  const callback = "rapidassist://stripe-redirect";
  const { redirectSystemPath } = load("app/+native-intent.tsx", {
    "../src/payments/stripeConfig": { stripeReturnURL: callback }
  });
  assert.equal(redirectSystemPath({ path: callback + "?return=1", initial: false }), "");
  assert.equal(redirectSystemPath({ path: callback, initial: true }), "/");
  const chat = "rapidassist://customer/chat/" + firstId;
  assert.equal(redirectSystemPath({ path: chat, initial: false }), chat);
});
