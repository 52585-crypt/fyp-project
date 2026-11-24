const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { spawn } = require("node:child_process");
const mongoose = require("mongoose");
const Stripe = require("stripe");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const { createApp } = require("../src/app");
const { User } = require("../src/models/User");
const { Invoice } = require("../src/models/Invoice");
const { Payment } = require("../src/models/Payment");
const { PaymentAttempt } = require("../src/models/PaymentAttempt");
const { Notification } = require("../src/models/Notification");
const { ServiceRequest } = require("../src/models/ServiceRequest");
const { StripeWebhookEvent } = require("../src/models/StripeWebhookEvent");
const { CommissionEntry } = require("../src/models/CommissionEntry");
const { ensureFinalizedInvoice } = require("../src/services/payments");
const { signAccessToken } = require("../src/utils/jwt");

const testKey = "sk_test_fixture";
const testSecret = "whsec_fixture";
const webhookPath = "/api/payments/stripe/webhook";
const createPath = "/api/payments/stripe/create-intent";

async function setup(t, key, secret) {
  const original = Object.fromEntries(["NODE_ENV", "JWT_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]
    .map((name) => [name, process.env[name]]));
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-payment-jwt";
  process.env.STRIPE_SECRET_KEY = key;
  if (secret) process.env.STRIPE_WEBHOOK_SECRET = secret;
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await replSet.stop();
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  await Promise.all([User.init(), Invoice.init(), Payment.init(), ServiceRequest.init()]);
  const [customer, stranger, provider, admin] = await User.create(
    ["user", "user", "mechanic", "admin"].map((role, number) => ({
      role, name: `Test Person ${number}`, phone: `+92300111111${number}`, passwordHash: "test"
    }))
  );
  const origin = `http://127.0.0.1:${server.address().port}`;

  async function api(path, { user, body, method, signature } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (user) headers.Authorization = `Bearer ${signAccessToken({ sub: user.id, role: user.role })}`;
    if (signature) headers["stripe-signature"] = signature;
    const response = await fetch(origin + path, {
      method: method || (body === undefined ? "GET" : "POST"), headers,
      body: typeof body === "string" ? body : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }

  async function fixture(status = "completed") {
    const request = await ServiceRequest.create({
      userId: customer._id, providerId: provider._id, category: "fuel_delivery", status,
      pickupLocation: { lat: 31.5, lng: 74.3 },
      estimate: { currency: "PKR", lines: [{ label: "Delivery", amount: 2000 }, { label: "Service fee", amount: 150 }] }
    });
    const invoice = await ensureFinalizedInvoice({ ...request.toObject(), status: "completed" });
    return { invoice, path: `/api/payments/request/${request.id}` };
  }

  const create = (invoice, user = customer) => api(createPath, { user, body: { invoiceId: invoice.id } });
  return { api, create, fixture, origin, customer, stranger, provider, admin };
}

test("Stripe checkout, signed webhook ordering, earnings, and payment history", async (t) => {
  const { api, create, fixture, customer, stranger, provider, admin } = await setup(t, testKey, testSecret);
  const intents = new Map();
  const keys = new Map();
  t.mock.method(Stripe.resources.PaymentIntents.prototype, "create", async (params, { idempotencyKey }) => {
    if (!keys.has(idempotencyKey)) {
      const id = `pi_fixture_${keys.size + 1}`;
      intents.set(id, { ...params, id, livemode: false, status: "requires_payment_method", client_secret: id + "_secret_fixture" });
      keys.set(idempotencyKey, id);
    }
    return intents.get(keys.get(idempotencyKey));
  });
  t.mock.method(Stripe.resources.PaymentIntents.prototype, "retrieve", async (id) => intents.get(id));
  const { invoice, path } = await fixture();
  const unfinished = await fixture("service_finished");
  const bundle = async () => (await api(path, { user: customer })).body;
  assert.equal((await api(createPath, { body: { invoiceId: invoice.id } })).status, 401);
  assert.equal((await create({ id: "invalid" })).status, 400);
  assert.equal((await create({ id: new mongoose.Types.ObjectId().toString() })).status, 404);
  assert.equal((await create(invoice, stranger)).status, 403);
  assert.equal((await create(invoice, provider)).status, 403);
  assert.equal((await create(unfinished.invoice)).status, 409);
  assert.equal((await api(createPath, { user: customer, body: { invoiceId: invoice.id, amount: 1 } })).status, 400);
  const incompatible = await fixture();
  await Invoice.updateOne({ _id: incompatible.invoice._id }, { $set: { currency: "USD" } });
  assert.equal((await create(incompatible.invoice)).status, 422);
  assert.equal(await Payment.countDocuments({ invoiceId: incompatible.invoice._id }), 0);
  assert.equal((await Invoice.findById(incompatible.invoice._id)).totalMinor, incompatible.invoice.totalMinor);

  const replies = await Promise.all([create(invoice), create(invoice)]);
  assert.deepEqual(replies.map((reply) => reply.status), [200, 200]);
  assert.equal(replies[0].body.clientSecret, replies[1].body.clientSecret);
  assert.equal(intents.size, 1);
  const initial = (await bundle()).payment;
  assert.equal(initial.amountMinor, 215000);
  assert.equal(initial.status, "pending");
  assert.equal(await Payment.countDocuments({ invoiceId: invoice._id }), 1);
  const intent = intents.get(initial.stripeIntentId);
  assert.equal(intent.currency, "pkr");

  const stripe = new Stripe(testKey);
  const now = Math.floor(Date.now() / 1000);
  function webhook(id, type, object, seconds = 0, valid = true) {
    const body = JSON.stringify({ id, livemode: false, type: `payment_intent.${type}`, created: now + seconds, data: { object } });
    const signature = valid ? stripe.webhooks.generateTestHeaderString({ payload: body, secret: testSecret }) : "invalid";
    return api(webhookPath, { body, signature });
  }
  assert.equal((await webhook("evt_bad_signature", "processing", intent, 0, false)).status, 400);
  assert.equal(await StripeWebhookEvent.countDocuments(), 0);
  const processing = { ...intent, status: "processing" };
  assert.equal((await webhook("evt_wrong_currency", "processing", { ...processing, currency: "usd" })).status, 409);
  assert.equal((await webhook("evt_wrong_currency", "processing", { ...processing, currency: "usd" })).status, 409);
  assert.equal(await StripeWebhookEvent.countDocuments({ _id: "evt_wrong_currency" }), 1);
  assert.equal((await webhook("evt_wrong_amount", "processing", { ...processing, amount: 1 })).status, 409);
  assert.equal((await webhook("evt_wrong_state", "processing", intent)).status, 409);
  assert.equal((await bundle()).payment.status, "pending");
  await webhook("evt_processing", "processing", processing);
  assert.equal((await bundle()).payment.status, "processing");
  await webhook("evt_failed", "payment_failed", intent, 1);
  assert.equal((await bundle()).payment.status, "failed");
  assert.equal((await create(invoice)).body.clientSecret, replies[0].body.clientSecret);
  await webhook("evt_canceled", "canceled", { ...intent, status: "canceled" }, 2);
  assert.equal((await bundle()).payment.status, "canceled");
  assert.notEqual((await create(invoice)).body.clientSecret, replies[0].body.clientSecret);
  const renewed = (await bundle()).payment;
  assert.equal(renewed.id, initial.id);
  assert.notEqual(renewed.stripeIntentId, initial.stripeIntentId);

  const renewedIntent = intents.get(renewed.stripeIntentId);
  const success = { ...renewedIntent, amount_received: 215000, status: "succeeded", latest_charge: "ch_fixture" };
  intents.set(success.id, success);
  const awaitingWebhook = await create(invoice);
  assert.equal(awaitingWebhook.status, 200);
  assert.equal(awaitingWebhook.body.awaitingConfirmation, true);
  assert.equal(awaitingWebhook.body.clientSecret, null);
  assert.equal((await bundle()).payment.status, "pending");
  assert.equal((await bundle()).invoice.stripePaidAt, null);
  assert.equal((await webhook("evt_wrong_received", "succeeded", { ...success, amount_received: 1 }, 3)).status, 409);
  assert.equal(await CommissionEntry.countDocuments(), 0);
  const deliverSuccess = () => webhook("evt_paid", "succeeded", success, 3);
  assert.deepEqual((await Promise.all([deliverSuccess(), deliverSuccess()])).map((event) => event.status), [200, 200]);
  await webhook("evt_stale", "payment_failed", renewedIntent, 2);
  assert.equal(await StripeWebhookEvent.countDocuments({ _id: "evt_paid" }), 1);
  assert.equal((await StripeWebhookEvent.findById("evt_stale")).outcome, "stale");
  assert.equal(await CommissionEntry.countDocuments(), 1);
  const ledger = await CommissionEntry.findById(renewed.id);
  assert.equal(ledger.commissionMinor, 15000);
  assert.equal(ledger.providerNetMinor, 200000);
  const paid = await bundle();
  assert.equal(paid.payment.status, "paid");
  assert.equal(paid.invoice.stripePaidAt, paid.payment.paidAt);
  assert.equal((await create(invoice)).status, 409);

  const cash = await fixture();
  const cashSelection = await api(cash.path, { user: customer, body: { method: "cash", idempotencyKey: "fixture-cash" } });
  assert.equal(cashSelection.body.payment.status, "pending");
  assert.equal((await create(cash.invoice)).status, 409);
  const collection = await api(cash.path + "/cash-collected", { user: provider, method: "PATCH" });
  assert.equal(collection.body.payment.status, "paid");
  assert.equal(await CommissionEntry.countDocuments(), 1);
  assert.equal(collection.body.payment.cashCollectionRecorded, true);
  const repeated = await api(cash.path + "/cash-collected", { user: provider, method: "PATCH" });
  assert.equal(repeated.body.payment.paidAt, collection.body.payment.paidAt);

  const simulated = await fixture();
  const simulation = await api(simulated.path, {
    user: customer, body: { method: "online_simulated", simulationResult: "success", idempotencyKey: "fixture-simulation" }
  });
  assert.equal(simulation.body.payment.status, "paid");
  assert.equal(simulation.body.simulationAllowed, true);
  const history = await api("/api/payments/history", { user: customer });
  assert.deepEqual(new Set(history.body.payments.map((payment) => payment.method)), new Set(["cash", "stripe", "online_simulated"]));
  assert.equal((await api("/api/payments/history", { user: stranger })).body.payments.length, 0);
  assert.equal((await api("/api/admin/payments", { user: customer })).status, 403);
  const stripeRow = (await api("/api/admin/payments", { user: admin })).body.payments.find((row) => row.method === "stripe");
  assert.equal(stripeRow.stripeIntentId, renewed.stripeIntentId);
  assert.equal(stripeRow.stripeChargeId, "ch_fixture");
  assert.equal(stripeRow.customer, customer.name);
  assert.equal(stripeRow.provider, provider.name);
  const adminCash = await fixture();
  await api(adminCash.path, { user: customer, body: { method: "cash", idempotencyKey: "fixture-admin-cash" } });
  assert.equal((await api(adminCash.path + "/cash-collected", { user: stranger, method: "PATCH" })).status, 403);
  assert.equal((await api(adminCash.path + "/cash-collected", { user: admin, method: "PATCH" })).body.payment.cashCollectionRecorded, true);
  assert.equal((await api(simulated.path + "/cash-collected", { user: admin, method: "PATCH" })).status, 409);

  for (const status of ["paid", "pending", "processing", "failed", "canceled"]) {
    const { invoice } = await fixture();
    const payment = await Payment.create({
      requestId: invoice.requestId, invoiceId: invoice.id, userId: customer.id, providerId: provider.id,
      method: "cash", status, amountMinor: invoice.totalMinor,
      ...(status === "paid" ? { paidAt: new Date() } : { collectedByUserId: provider.id })
    });
    assert.equal(payment.toJSONSafe().cashCollectionRecorded, false);
  }
  const { stats } = (await api("/api/admin/dashboard", { user: admin })).body;
  assert.equal(stats.revenue, 4300);
  assert.equal(stats.serviceFeeRevenue, 300);
  assert.equal(stats.providerEarnings, 4000);
  assert.equal(stats.unverifiedCashPayments, 1);
  const { earnings } = (await api("/api/requests/provider/earnings", { user: provider })).body;
  assert.equal(earnings.total, 4000);
  assert.equal(earnings.paidJobs, 2);
  const report = await api("/api/admin/finance/payments", { user: admin });
  assert.equal(report.status, 200);
  const byClassification = Object.fromEntries(report.body.analytics.classifications.map(row => [row._id.classification, row]));
  assert.equal(byClassification.cash_confirmed.count, 2);
  assert.equal(byClassification.cash_confirmed.amountMinor, stats.revenue * 100);
  assert.equal(byClassification.cash_unverified.count, 1);
  assert.equal(byClassification.stripe_test.count, 1);
  assert.equal(byClassification.simulation.count, 1);
  assert.equal(report.body.payments.find(row => row.method === "stripe").stripeIntentId, undefined);
  const commission = (await api("/api/admin/finance/commission", { user: admin })).body;
  assert.equal(commission.entries.length, 1);
  assert.equal(commission.entries[0].id, renewed.id);
  assert.equal(commission.entries[0].reconciled, true);
  assert.equal(commission.totals[0].amountMinor, ledger.commissionMinor);
  assert.equal(commission.monthly[0].currencies[0].count, 1);
  const providerReport = (await api("/api/admin/finance/earnings", { user: admin })).body;
  assert.equal(providerReport.totals[0].jobs, earnings.paidJobs);
  assert.equal(providerReport.totals[0].estimatedMinor, earnings.total * 100);
  assert.equal(providerReport.totals[0].feeMinor, stats.serviceFeeRevenue * 100);
});

test("operational runtimes reject simulation before writing billing or notification records", async (t) => {
  const { api, customer, provider } = await setup(t, testKey, testSecret);
  const request = await ServiceRequest.create({
    userId: customer.id, providerId: provider.id, category: "fuel_delivery", status: "completed",
    pickupLocation: { lat: 31.5, lng: 74.3 }
  });
  const originalMode = process.env.NODE_ENV;
  try {
    for (const mode of ["production", "staging", undefined]) {
      if (mode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = mode;
      const { status } = await api(`/api/payments/request/${request.id}`, {
        user: customer, body: { method: "online_simulated", simulationResult: "success", idempotencyKey: "fixture-rejected" }
      });
      assert.equal(status, 403);
    }
    for (const Model of [Invoice, Payment, PaymentAttempt, Notification]) {
      assert.equal(await Model.countDocuments(), 0);
    }
  } finally {
    if (originalMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalMode;
  }
});

async function waitForStatus(api, path, customer, status) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { body } = await api(path, { user: customer });
    if (body.payment?.status === status) return body;
    await delay(500);
  }
  assert.fail(`Did not receive a verified webhook for status ${status}`);
}

test("Stripe sandbox test cards with Stripe CLI forwarding", {
  skip: process.env.RUN_STRIPE_CLI_TEST !== "1",
  timeout: 100000
}, async (t) => {
  const key = require("dotenv").config({ quiet: true }).parsed?.STRIPE_SECRET_KEY;
  assert.ok(/^(sk|rk)_test_/.test(key || ""), "A sandbox API key is required");
  const { api, create, fixture, origin, customer } = await setup(t, key);
  const events = ["succeeded", "payment_failed", "canceled", "processing"].map((name) => `payment_intent.${name}`);
  const useProcessGroup = process.platform !== "win32";
  const cli = spawn(process.env.STRIPE_CLI_BIN || "stripe", [
    "listen", "--events", events.join(","), "--forward-to", origin + webhookPath
  ], { env: { ...process.env, STRIPE_API_KEY: key }, stdio: ["ignore", "pipe", "pipe"], detached: useProcessGroup });
  t.after(() => {
    if (cli.exitCode !== null || !cli.pid) return;
    if (useProcessGroup) process.kill(-cli.pid, "SIGTERM");
    else cli.kill();
  });

  process.env.STRIPE_WEBHOOK_SECRET = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Stripe CLI listener did not become ready")), 15000);
    let initialOutput = "";
    const read = (bytes) => {
      initialOutput += bytes;
      const match = initialOutput.match(/whsec_[a-zA-Z0-9]+/);
      if (match && initialOutput.includes("Ready!")) {
        clearTimeout(timer);
        cli.stdout.off("data", read);
        cli.stderr.off("data", read);
        cli.stdout.resume();
        cli.stderr.resume();
        resolve(match[0]);
      }
    };
    cli.stdout.on("data", read);
    cli.stderr.on("data", read);
    cli.once("error", (error) => { clearTimeout(timer); reject(error); });
    cli.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Stripe CLI exited with code ${code}`)); });
  });

  const stripe = new Stripe(key, { apiVersion: "2025-09-30.clover" });
  const { invoice, path } = await fixture();
  assert.equal((await create(invoice)).status, 200);
  const initial = (await api(path, { user: customer })).body.payment;
  await assert.rejects(
    stripe.paymentIntents.confirm(initial.stripeIntentId, { payment_method: "pm_card_chargeDeclined" }),
    (error) => error.code === "card_declined"
  );
  await waitForStatus(api, path, customer, "failed");
  await stripe.paymentIntents.cancel(initial.stripeIntentId);
  await waitForStatus(api, path, customer, "canceled");
  assert.equal((await create(invoice)).status, 200);
  const replacement = (await api(path, { user: customer })).body.payment;
  const confirmed = await stripe.paymentIntents.confirm(replacement.stripeIntentId, { payment_method: "pm_card_visa" });
  assert.equal(confirmed.livemode, false);
  const paid = await waitForStatus(api, path, customer, "paid");
  assert.equal(paid.payment.amountMinor, confirmed.amount_received);
  assert.equal(paid.payment.stripeChargeId, confirmed.latest_charge);
  assert.equal(paid.invoice.stripePaidAt, paid.payment.paidAt);
  assert.equal(await CommissionEntry.countDocuments(), 1);
});
