const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { ServiceRequest } = require("../src/models/ServiceRequest");
const { Invoice } = require("../src/models/Invoice");
const { Payment } = require("../src/models/Payment");
const { CommissionEntry } = require("../src/models/CommissionEntry");
const { StripeWebhookEvent } = require("../src/models/StripeWebhookEvent");
const { signAccessToken } = require("../src/utils/jwt");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = randomBytes(32).toString("hex");

const day = new Date("2026-10-31T23:59:59.999Z");
const nextDay = new Date("2026-11-01T00:00:00Z");
const paymentProps = { method: "cash", status: "paid", amountMinor: 10000, createdAt: day, paidAt: nextDay };
let mongo, server, origin, admin, customer, mechanic, other;
let cash, usd, unverified, pending, processing, failed, canceled, simulation, sandbox, legacy, unfinished, invoiceOnly;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Invoice.init(), Payment.init(), StripeWebhookEvent.init(), CommissionEntry.init()]);
  [admin, customer, mechanic, other] = await User.create([
    ["admin", "Fixture Admin"], ["user", "Asha [North]"], ["mechanic", "Hamza Ali"], ["mechanic", "Other Provider"]
  ].map(([role, name], index) => ({ role, name, phone: "00000" + index, passwordHash: "private-password" })));
  let invoiceIndex = 0;
  async function fixture(props, category = "mechanic", provider = mechanic, status = "completed") {
    const request = await ServiceRequest.create({
      userId: customer._id, providerId: provider._id, category, status,
      pickupLocation: { lat: 1, lng: 2 }
    });
    const refs = { requestId: request._id, userId: customer._id, providerId: provider._id };
    const invoice = await Invoice.create({
      ...refs, invoiceNumber: "RA-FIXTURE-" + ++invoiceIndex, totalMinor: props?.amountMinor ?? 10000,
      providerEarningsMinor: 9000, serviceFeeMinor: 1000, currency: props?.currency ?? "PKR",
      lines: [{ label: "Service", amountMinor: 9000 }, { label: "Service fee", amountMinor: 1000 }],
      createdAt: props?.createdAt ?? day
    });
    const payment = props ? await Payment.create({ ...refs, invoiceId: invoice._id, ...props }) : null;
    return { request, invoice, payment };
  }

  cash = await fixture({ ...paymentProps, collectedByUserId: mechanic._id });
  usd = await fixture({ ...paymentProps, currency: "USD", createdAt: nextDay, paidAt: new Date(+nextDay + 1000),
    providerNetMinor: 8000, collectedByUserId: admin._id }, "car_towing", other);
  unverified = await fixture(paymentProps);
  pending = await fixture({ ...paymentProps, status: "pending", collectedByUserId: mechanic._id });
  processing = await fixture({ ...paymentProps, status: "processing", method: "stripe", stripeIntentId: "fixture-processing",
    stripeEventCreated: 31, createdAt: nextDay });
  failed = await fixture({ ...paymentProps, status: "failed", method: "online_simulated", createdAt: nextDay });
  canceled = await fixture({ ...paymentProps, status: "canceled", createdAt: nextDay });
  simulation = await fixture({ ...paymentProps, method: "online_simulated" });
  sandbox = await fixture({ ...paymentProps, method: "stripe", stripeIntentId: "fixture-sandbox", stripeChargeId: "private-charge",
    stripeEventCreated: +nextDay / 1000, providerNetMinor: 9000 }, "fuel_delivery");
  legacy = await fixture({ ...paymentProps, method: "stripe", stripeIntentId: "fixture-legacy",
    stripeEventCreated: +nextDay / 1000, providerNetMinor: 9000 });
  unfinished = await fixture({ ...paymentProps, collectedByUserId: admin._id, paidAt: day }, "car_towing", mechanic, "in_progress");
  invoiceOnly = await fixture(null);
  await StripeWebhookEvent.create([
    { _id: "fixture-applied", intentId: sandbox.payment.stripeIntentId, type: "payment_intent.succeeded", outcome: "applied", stripeCreated: +nextDay / 1000 },
    { _id: "fixture-not-applied", intentId: legacy.payment.stripeIntentId, type: "payment_intent.succeeded", outcome: "mismatch", stripeCreated: +nextDay / 1000 },
    { _id: "fixture-process", intentId: processing.payment.stripeIntentId, type: "payment_intent.processing", outcome: "applied", stripeCreated: 31 }
  ]);
  await Invoice.updateOne({ _id: sandbox.invoice._id }, { stripePaidAt: nextDay, stripePaymentId: sandbox.payment._id });
  await CommissionEntry.create([sandbox, legacy].map(({ payment }) => ({
    _id: payment._id, invoiceId: payment.invoiceId, providerId: payment.providerId, currency: payment.currency,
    grossMinor: 10000, commissionMinor: 1000, providerNetMinor: 9000, earnedAt: nextDay
  })));
  server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${server.address().port}/api/admin/finance`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function api(path, query = {}, actor = admin, method = "GET") {
  const headers = actor ? { Authorization: `Bearer ${signAccessToken({ sub: actor.id, role: actor.role })}` } : {};
  const response = await fetch(origin + path + "?" + new URLSearchParams(query), { headers, method });
  return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
}

test("finance reporting is admin-only, read-only and uncached", async () => {
  for (const path of ["/payments", "/payments/" + cash.payment.id, "/invoices", "/invoices/" + cash.invoice.id, "/earnings", "/commission"]) {
    assert.equal((await api(path, {}, null)).status, 401);
    assert.equal((await api(path, {}, customer)).status, 403);
    assert.equal((await api(path, {}, mechanic)).status, 403);
    assert.equal((await api(path)).cache, "no-store");
    assert.equal((await api(path, {}, admin, "POST")).status, 404);
  }
  assert.equal((await api("/payments/invalid")).status, 400);
  assert.equal((await api("/invoices/" + String(new mongoose.Types.ObjectId()))).status, 404);
});

test("payment search, category and person filters, UTC dates and stable pagination", async () => {
  for (const q of [cash.payment.id, cash.request.id]) {
    const { body } = await api("/payments", { q });
    assert.deepEqual(body.payments.map(row => row.id), [cash.payment.id]);
  }
  for (const q of [mechanic.id, "Asha [", "Hamza"]) {
    const response = await api("/payments", { q, classification: "cash_confirmed", status: "paid", method: "cash",
      category: "mechanic", provider: mechanic.id, customer: "Asha", from: "2026-10-31", to: "2026-10-31" });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.payments.map(row => row.id), [cash.payment.id]);
  }
  const first = (await api("/payments", { limit: 3 })).body;
  const second = (await api("/payments", { limit: 3, cursor: first.next })).body;
  assert.deepEqual(first.payments.map(row => row.id), [canceled.payment.id, failed.payment.id, processing.payment.id]);
  assert.equal(new Set([...first.payments, ...second.payments].map(row => row.id)).size, 6);
  assert.deepEqual(first.analytics, second.analytics);
  for (const query of [{ limit: 51 }, { cursor: "bad" }, { to: "2026-02-30" }, { from: "2026-11-01", to: "2026-10-31" },
    { category: "towing" }, { method: "pi_123" }, { classification: "revenue" }, { status: "invalid" }, { q: "x" }, { unknown: "1" }]) {
    assert.equal((await api("/payments", query)).status, 400);
  }
  assert.deepEqual((await api("/payments", { q: "^.*" })).body.payments, []);
});

test("cash, sandbox, ambiguous Stripe and simulations stay distinct in summaries and details", async () => {
  const { body } = await api("/payments");
  const classifications = new Map(body.payments.map(row => [row.id, row.classification]));
  assert.equal(classifications.get(cash.payment.id), "cash_confirmed");
  assert.equal(classifications.get(usd.payment.id), "cash_confirmed");
  assert.equal(classifications.get(unverified.payment.id), "cash_unverified");
  assert.equal(classifications.get(pending.payment.id), "cash_not_collected");
  assert.equal(classifications.get(canceled.payment.id), "cash_not_collected");
  assert.equal(classifications.get(sandbox.payment.id), "stripe_test");
  assert.equal(classifications.get(legacy.payment.id), "stripe_unverified");
  assert.equal(classifications.get(processing.payment.id), "stripe_test");
  assert.equal(classifications.get(simulation.payment.id), "simulation");
  assert.equal(classifications.get(failed.payment.id), "simulation");
  assert.equal(body.analytics.statuses.find(row => row._id === "processing").count, 1);
  assert.equal(body.analytics.statuses.find(row => row._id === "canceled").count, 1);
  const collections = body.analytics.collections;
  assert.equal(collections.reduce((sum, row) => sum + row.count, 0), 3);
  assert.deepEqual(body.analytics.monthly.map(row => row._id), ["2026-11", "2026-10"]);
  const detail = (await api("/payments/" + sandbox.payment.id)).body;
  assert.equal(detail.invoice.id, sandbox.invoice.id);
  assert.equal(detail.payment.customer.name, customer.name);
  const serialized = JSON.stringify([body, detail]);
  for (const token of ["stripeIntentId", "stripeChargeId", "private-charge", "fixture-sandbox", "collectedByUserId", "passwordHash", "private-password"]) {
    assert.equal(serialized.includes(token), false, token);
  }
});

test("invoice listing and detail read existing rows, including invoices without payments", async () => {
  const lookup = (await api("/invoices", { q: invoiceOnly.invoice.invoiceNumber.toLowerCase(), category: "mechanic" })).body;
  assert.deepEqual(lookup.invoices.map(row => row.id), [invoiceOnly.invoice.id]);
  const detail = (await api("/invoices/" + invoiceOnly.invoice.id)).body;
  assert.equal(detail.invoice.status, "finalized");
  assert.equal(detail.invoice.lines[1].label, "Service fee");
  assert.equal(detail.payment, null);
  assert.equal((await api("/invoices/" + sandbox.invoice.id)).body.payment.classification, "stripe_test");
  const snapshot = await Invoice.countDocuments();
  await api("/invoices");
  assert.equal(await Invoice.countDocuments(), snapshot);
});

test("commission reconciles one durable sandbox ledger entry and keeps exceptions separate", async () => {
  const { body } = await api("/commission", { from: "2026-11-01", to: "2026-11-01", limit: 1 });
  const second = (await api("/commission", { from: "2026-11-01", to: "2026-11-01", limit: 1, cursor: body.next })).body;
  assert.deepEqual([body.entries[0], second.entries[0]].map(row => [row.id, row.reconciled]), [
    [legacy.payment.id, false], [sandbox.payment.id, true]
  ]);
  assert.equal(body.unreconciled, 1);
  assert.equal(body.totals[0]._id.category, "fuel_delivery");
  assert.equal(body.totals[0].amountMinor, 1000);
  assert.equal(body.totals[0].providerNetMinor, 9000);
  assert.equal(body.monthly[0].currencies[0].count, 1);
  assert.equal((await api("/commission", { to: "2026-10-31" })).body.entries.length, 0);
});

test("earnings group confirmed completed jobs by provider and currency with separate net and estimates", async () => {
  const { body } = await api("/earnings", { from: "2026-11-01", to: "2026-11-01", limit: 1 });
  assert.equal(body.providers[0].provider.id, other.id);
  assert.equal(body.providers[0].amounts[0].recordedMinor, 8000);
  assert.equal(body.providers[0].amounts[0].estimatedJobs, 0);
  assert.equal(body.providers[0].amounts[0].currency, "USD");
  const second = (await api("/earnings", { from: "2026-11-01", to: "2026-11-01", limit: 1, cursor: body.next })).body;
  const estimated = second.providers[0].amounts[0];
  assert.equal(second.providers[0].provider.id, mechanic.id);
  assert.equal(estimated.jobs, 1);
  assert.equal(estimated.grossMinor, 10000);
  assert.equal(estimated.estimatedMinor, 9000);
  assert.equal(estimated.feeMinor, 1000);
  assert.equal(estimated.recordedJobs, 0);
  assert.equal(second.next, null);
  assert.equal((await api("/earnings", { to: "2026-10-31" })).body.totals.length, 0);
  assert.equal((await api("/payments", { q: unfinished.payment.id })).body.payments[0].classification, "cash_confirmed");
});
