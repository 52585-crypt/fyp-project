const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { ServiceRequest } = require("../models/ServiceRequest");
const { Payment } = require("../models/Payment");
const { PaymentAttempt } = require("../models/PaymentAttempt");
const { auditedChange, recordActivity, recordRejectedAction } = require("../services/adminActivity");
const { ensureFinalizedInvoice } = require("../services/payments");
const { createNotificationSafely } = require("../services/notifications");
const { notifyRequest } = require("../services/realtime");

const { createStripeIntent } = require("../services/stripePayments");

const { isObjectIdOrHexString } = require("mongoose");

const router = express.Router();
router.use(requireAuth);

function error(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function simulationAllowed() {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

async function accessibleRequest(requestId, user) {
  const request = await ServiceRequest.findById(requestId);
  if (!request) throw error("Request not found", 404);
  const userId = String(user._id);
  if (user.role !== "admin" && String(request.userId) !== userId && String(request.providerId) !== userId) {
    throw error("Forbidden", 403);
  }
  return request;
}

async function bundle(request) {
  const invoice = await ensureFinalizedInvoice(request);
  const payment = await Payment.findOne({ requestId: request._id });
  return {
    invoice: invoice.toJSONSafe(), payment: payment ? payment.toJSONSafe() : null,
    simulationAllowed: simulationAllowed()
  };
}

router.post("/stripe/create-intent", async (req, res, next) => {
  try {
    if (req.authRole !== "user") throw error("Forbidden", 403);
    if (!req.body || Object.keys(req.body).length !== 1 || !Object.hasOwn(req.body, "invoiceId")) {
      throw error("Supply invoiceId only.", 400);
    }
    const intent = await createStripeIntent(req.body.invoiceId, req.user._id);
    res.set("Cache-Control", "no-store").json({ ok: true, ...intent });
  } catch (err) { next(err); }
});

router.get("/history", async (req, res, next) => {
  try {
    if (req.authRole !== "user") throw error("Forbidden", 403);
    const filter = { userId: req.user._id };
    const { before } = req.query;
    if (before !== undefined) {
      if (typeof before !== "string" || !isObjectIdOrHexString(before)) throw error("Invalid payment cursor.", 400);
      filter._id = { $lt: before };
    }
    const pageSize = 50;
    const rows = await Payment.find(filter).sort({ _id: -1 }).limit(pageSize + 1);
    const payments = rows.slice(0, pageSize).map((payment) => payment.toJSONSafe());
    res.set("Cache-Control", "no-store").json({ ok: true, payments, next: rows.length > pageSize ? payments[pageSize - 1].id : null });
  } catch (err) { next(err); }
});

router.get("/request/:requestId", async (req, res, next) => {
  try {
    const request = await accessibleRequest(req.params.requestId, req.user);
    res.set("Cache-Control", "no-store").json({ ok: true, ...(await bundle(request)) });
  } catch (err) { next(err); }
});

router.post("/request/:requestId", async (req, res, next) => {
  try {
    const request = await accessibleRequest(req.params.requestId, req.user);
    if (String(request.userId) !== String(req.user._id)) throw error("Only the customer can select payment", 403);
    const method = String(req.body?.method || "");
    const idempotencyKey = String(req.body?.idempotencyKey || "").trim();
    if (!["cash", "online_simulated"].includes(method)) throw error("Invalid payment method", 400);
    if (method === "online_simulated" && !simulationAllowed()) {
      throw error("Simulated payments are available in development and test only.", 403);
    }
    if (idempotencyKey.length < 8 || idempotencyKey.length > 100) throw error("Invalid payment submission ID", 400);
    if (method === "online_simulated" && !["success", "failed"].includes(req.body?.simulationResult)) {
      throw error("Choose a simulated payment result", 400);
    }

    const invoice = await ensureFinalizedInvoice(request);
    let attempt = await PaymentAttempt.findOne({ userId: req.user._id, idempotencyKey });
    const requestedOutcome = method === "cash" ? "pending" : req.body.simulationResult === "success" ? "paid" : "failed";
    if (attempt && (String(attempt.requestId) !== request.id || attempt.method !== method || attempt.outcome !== requestedOutcome)) {
      throw error("Payment submission ID was already used for a different payment", 409);
    }
    let payment = await Payment.findOne({ requestId: request._id });
    if (!payment) {
      try {
        payment = await Payment.create({
          requestId: request._id, invoiceId: invoice._id, userId: request.userId, providerId: request.providerId,
          currency: invoice.currency, amountMinor: invoice.totalMinor, method, status: "pending"
        });
      } catch (createError) {
        if (createError.code !== 11000) throw createError;
        payment = await Payment.findOne({ requestId: request._id });
        if (!payment) throw createError;
      }
    }
    if (payment.method !== method) throw error(`Payment method is already ${payment.method}`, 409);

    if (payment.status === "paid") return res.json({
      ok: true, invoice: invoice.toJSONSafe(), payment: payment.toJSONSafe(), simulationAllowed: simulationAllowed()
    });

    const outcome = requestedOutcome;
    if (!attempt) {
      try {
        attempt = await PaymentAttempt.create({ paymentId: payment._id, requestId: request._id, userId: req.user._id, idempotencyKey, method, outcome });
      } catch (attemptError) {
        if (attemptError.code !== 11000) throw attemptError;
        attempt = await PaymentAttempt.findOne({ userId: req.user._id, idempotencyKey });
        if (!attempt) throw attemptError;
        if (String(attempt.requestId) !== request.id || attempt.method !== method || attempt.outcome !== outcome) {
          throw error("Payment submission ID was already used for a different payment", 409);
        }
      }
    }

    // Reapply the recorded outcome if the previous request failed between writes.
    // A successful payment is terminal and must never be downgraded by a retry.
    payment = await Payment.findOneAndUpdate(
      { _id: payment._id, status: { $ne: "paid" } },
      { $set: { status: outcome, paidAt: outcome === "paid" ? new Date() : null } },
      { new: true }
    ) || await Payment.findById(payment._id);
    if (!payment) throw error("Payment no longer available. Refresh and try again.", 409);
    const finalOutcome = payment.status;
    notifyRequest(request, "payment");
    createNotificationSafely({
      userId: request.userId,
      type: "payment_status",
      title: finalOutcome === "paid" ? "Payment simulation succeeded" : finalOutcome === "failed" ? "Payment simulation failed" : "Cash payment pending",
      body: method === "online_simulated" ? "This was a simulation. No money was collected." : "The provider will confirm cash collection.",
      data: { requestId: request.id, paymentStatus: finalOutcome, route: "/(user)/payment" }
    });
    if (finalOutcome === "paid" || finalOutcome === "pending") createNotificationSafely({
      userId: request.providerId,
      type: "payment_status",
      title: finalOutcome === "paid" ? "Payment simulation succeeded" : "Customer selected cash",
      body: method === "online_simulated" ? "This was a simulation. Earnings are unaffected." : "Confirm cash collection from the invoice screen.",
      data: { requestId: request.id, paymentStatus: finalOutcome, route: "/(provider)/payment" }
    });
    res.json({ ok: true, invoice: invoice.toJSONSafe(), payment: payment.toJSONSafe(), simulationAllowed: simulationAllowed() });
  } catch (err) { next(err); }
});

router.patch("/request/:requestId/cash-collected", async (req, res, next) => {
  const event = req.authRole === "admin" ? { action: "cash.confirm", resourceId: req.params.requestId } : null;
  try {
    const request = await accessibleRequest(req.params.requestId, req.user);
    if (req.authRole !== "admin" && (req.authRole !== "mechanic" || String(request.providerId) !== String(req.user._id))) {
      throw error("Only the assigned provider can confirm cash", 403);
    }
    const confirm = session => Payment.findOneAndUpdate(
      { requestId: request._id, method: "cash", status: "pending" },
      { $set: { status: "paid", paidAt: new Date(), collectedByUserId: req.user._id } },
      { new: true, session }
    );
    const payment = event ? await auditedChange(req, res, event, confirm) : await confirm();
    if (!payment) {
      const collected = await Payment.findOne({ requestId: request._id, method: "cash", status: "paid" });
      if (collected) {
        if (event) await recordActivity(req, res, event, "no_change", 200);
        return res.json({ ok: true, payment: collected.toJSONSafe() });
      }
      throw error("Pending cash payment not found", 409);
    }
    notifyRequest(request, "payment");
    createNotificationSafely({
      userId: request.userId,
      type: "payment_status",
      title: "Cash payment confirmed",
      body: "Collection of your cash payment was recorded.",
      data: { requestId: request.id, paymentStatus: "paid", route: "/(user)/payment" }
    });
    res.json({ ok: true, payment: payment.toJSONSafe() });
  } catch (err) {
    await recordRejectedAction(req, res, event, err);
    next(err);
  }
});

module.exports = router;
