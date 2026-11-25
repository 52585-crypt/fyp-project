const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(relative, mocks = {}, globals = {}) {
  const filename = path.resolve(__dirname, "..", relative);
  const module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText;
  vm.runInNewContext(output, {
    module, exports: module.exports, Error,
    require: (name) => (/design\/tokens$/.test(name) ? require("./helpers/designTokens.cjs") : Object.hasOwn(mocks, name) ? mocks[name] : require(name)),
    ...globals
  }, { filename });
  return module.exports;
}

test("same-coordinate retry shares a single OSRM call even while a prior request exceeds the cache TTL", async () => {
  let now = 0;
  let calls = 0;
  const pending = [];
  const routing = load("src/services/routing.ts", {
    "../utils/distance": load("src/utils/distance.ts")
  }, {
    Date: { now: () => now }, setTimeout: () => 1, clearTimeout() {}, AbortController,
    fetch: () => { calls += 1; return new Promise((resolve) => pending.push(resolve)); }
  });
  const from = { latitude: 31.2, longitude: 74.2 };
  const to = { latitude: 31.3, longitude: 74.3 };
  const first = routing.getDrivingRouteMetrics(from, to);
  now += 21000;
  const concurrent = routing.getDrivingRouteMetrics(from, to);
  assert.equal(calls, 1);
  pending.shift()({ ok: false });
  await assert.rejects(first, /unavailable/);
  await assert.rejects(concurrent, /unavailable/);
  const retry = routing.getDrivingRouteMetrics(from, to);
  const duplicate = routing.getDrivingRouteMetrics(from, to);
  assert.equal(calls, 2);
  pending.shift()({ ok: true, json: async () => ({
    code: "Ok", routes: [{ distance: 2200, duration: 300, geometry: {
      type: "LineString", coordinates: [[74.2, 31.2], [74.3, 31.3]]
    } }]
  }) });
  assert.equal((await retry).coordinates.length, 2);
  assert.equal(await retry, await duplicate);
});

test("tracking retries an approximate ETA with unchanged coordinates and restores road geometry", async () => {
  const cells = [];
  let index = 0;
  let effects = [];
  const react = {
    useMemo: (factory) => factory(),
    useRef(initial) {
      const i = index++;
      if (!(i in cells)) cells[i] = { current: initial };
      return cells[i];
    },
    useState(initial) {
      const i = index++;
      if (!(i in cells)) cells[i] = initial;
      return [cells[i], (value) => { cells[i] = typeof value === "function" ? value(cells[i]) : value; }];
    },
    useEffect(effect, deps) {
      const i = index++;
      if (cells[i] && cells[i].deps.every((value, pos) => value === deps[pos])) return;
      cells[i]?.cleanup?.();
      effects.push(() => { cells[i] = { deps, cleanup: effect() }; });
    }
  };
  let calls = 0;
  const { useCustomerRoute } = load("src/requests/useCustomerRoute.ts", {
    react,
    "../services/locationMapPolicy": { hasOperationalCoordinates: (value) => Boolean(value) },
    "../utils/distance": { distanceKm: () => 4 },
    "./liveEta": load("src/requests/liveEta.ts", { "../utils/distance": { distanceKm: () => 4 } }, { Math, Date }),
    "../services/routing": { getDrivingRouteMetrics: async (from, to) => {
      if (++calls === 1) throw new Error("unavailable");
      return { distanceKm: 5, durationMinutes: 10, coordinates: [from, to] };
    } }
  });
  const request = {
    id: "request", category: "mechanic", status: "provider_on_way",
    providerLocation: { lat: 31.2, lng: 74.2, updatedAt: new Date().toISOString() },
    pickupLocation: { lat: 31.3, lng: 74.3 }
  };
  function render() {
    index = 0;
    const state = useCustomerRoute(request);
    const next = effects;
    effects = [];
    next.forEach((effect) => effect());
    return state;
  }
  render();
  await new Promise(setImmediate);
  const fallback = render();
  assert.equal(fallback.approximate, true);
  assert.equal(fallback.route.length, 0);
  fallback.retry();
  fallback.retry();
  assert.equal(render().approximate, true);
  await new Promise(setImmediate);
  const recovered = render();
  assert.equal(recovered.approximate, false);
  assert.equal(recovered.route.length, 2);
  assert.equal(recovered.minutes, 10);
  assert.equal(calls, 2);
});

test("tracking failures distinguish offline or server errors from confirmed unavailable requests", () => {
  const { trackingLoadFailure, trackingEmptyTitle } = load("src/requests/trackingLoadState.ts");
  for (const error of [new Error("offline"), { response: { status: 503, data: { message: "retry later" } } }]) {
    const failure = trackingLoadFailure(error, true);
    assert.equal(failure.kind, "failed");
    assert.equal(trackingEmptyTitle(failure.kind), "Couldn’t load tracking");
  }
  assert.equal(trackingLoadFailure({ response: { status: 404 } }, false).kind, "failed");
  assert.equal(trackingLoadFailure({ response: { status: 404 } }, true).kind, "unavailable");
  assert.equal(trackingEmptyTitle("empty"), "No request to track");
});

test("booking previews match the actual server tariff, including minimum and rounded towing distances", () => {
  const filename = path.resolve(__dirname, "../../server/src/controllers/requests.controller.js");
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest);
  const methods = ["normalizeStr", "parseNum", "estimateFor"].map((name) => {
    const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(declaration, name);
    return declaration.getText(source);
  });
  const serverEstimate = vm.runInNewContext(methods.join("\n") + "\nestimateFor;", {
    badRequest: (message) => new Error(message)
  });
  const { buildEstimate } = load("src/requests/requestEstimate.ts");
  const cases = [
    ...[0.32, 1.04, 1.05, 8.749, 19.78].map((distance) => ["car_towing", distance, "petrol", 5]),
    ...["petrol", "diesel"].flatMap((fuel) => [1, 3, 5, 10, 50].map((liters) => ["fuel_delivery", null, fuel, liters])),
    ["mechanic", null, "petrol", 5]
  ];
  for (const [category, distance, fuelType, liters] of cases) {
    const { currency, ...server } = serverEstimate(category, { fuelDetails: { fuelType, liters } }, distance);
    assert.equal(currency, "PKR");
    assert.deepEqual(JSON.parse(JSON.stringify(buildEstimate(category, distance, fuelType, liters))),
      JSON.parse(JSON.stringify(server)));
  }
  for (const distance of [null, 0, -2, NaN]) assert.equal(buildEstimate("car_towing", distance, "petrol", 5), null);
  assert.equal(buildEstimate("fuel_delivery", null, "diesel", 0), null);
});

test("cash events queue one fresh invoice read and confirmed cash survives an older pending response", async () => {
  const { createPaymentRefresh, keepConfirmedCash } = load("src/payments/paymentRefresh.ts");
  const pending = [];
  const refresh = createPaymentRefresh(() => new Promise((resolve) => pending.push(resolve)));
  const initial = refresh.refresh();
  assert.equal(refresh.refresh(), initial);
  const updated = refresh.afterChange();
  assert.equal(refresh.afterChange(), updated);
  assert.equal(pending.length, 1);
  const old = { invoice: { id: "invoice" }, payment: { method: "cash", status: "pending" } };
  pending.shift()(old);
  await initial;
  await new Promise(setImmediate);
  assert.equal(pending.length, 1);
  const paid = { ...old, payment: { method: "cash", status: "paid", cashCollectionRecorded: true } };
  pending.shift()(paid);
  assert.equal(await updated, paid);
  assert.equal(keepConfirmedCash(paid, old).payment, paid.payment);
  assert.equal(keepConfirmedCash(paid, { ...old, invoice: { id: "different" } }).payment, old.payment);
});

test("Web opens and prints an escaped invoice-only document and handles blocked pop-ups", async () => {
  const payments = load("src/payments/payments.api.ts", { "../config/api": {} });
  const { buildInvoiceDocument } = load("src/payments/invoiceDocument.ts", { "./payments.api": payments });
  const calls = [];
  const popup = {
    document: { open() {}, close() {}, write: (html) => calls.push(html) },
    focus() {}, print: () => calls.push("print")
  };
  const window = { open: () => popup, print: () => assert.fail("must not print the app") };
  const { printInvoice } = load("src/payments/printInvoice.web.ts", {}, { window });
  const html = buildInvoiceDocument({
    invoice: {
      invoiceNumber: "AUDIT", currency: "PKR", finalizedAt: "2026-11-23T00:00:00Z",
      totalMinor: 125050, lines: [{ label: "<script>bad</script>", amountMinor: 125050 }]
    },
    payment: { method: "cash", status: "paid", cashCollectionRecorded: true }
  });
  assert.match(html, /Invoice AUDIT/);
  assert.match(html, /PKR 1,250.5/);
  assert.match(html, /Cash collected/);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  await printInvoice(html);
  assert.deepEqual(calls, [html, "print"]);
  assert.equal(popup.opener, null);
  window.open = () => null;
  await assert.rejects(printInvoice(html), /Allow pop-ups/);
});

test("Profile exposes only supported actions and links the existing Vehicles and payment history screens", () => {
  const { customerProfileRows } = load("src/auth/customerProfileRows.ts");
  const linked = customerProfileRows.filter((row) => row.href);
  assert.deepEqual(Array.from(linked, (row) => row.title), ["Vehicles", "Payment history", "Notifications", "Support"]);
  assert.equal(linked[0].href, "/vehicles");
  assert.equal(linked[1].href.pathname, "/requests");
  assert.equal(linked[1].href.params.view, "payments");
  // Rows without a backend feature never navigate; they are labelled Coming soon instead.
  for (const row of customerProfileRows.filter((r) => !r.href)) assert.equal(row.comingSoon, true);
});

test("both booking routes resolve categories from the same service options", () => {
  const { customerServices, normalizeBookingCategory } = load("src/requests/booking/category.ts");
  for (const { value } of customerServices) {
    assert.equal(normalizeBookingCategory(value), value);
    assert.equal(normalizeBookingCategory([value]), value);
  }
  assert.equal(normalizeBookingCategory("invalid"), "car_towing");
});
