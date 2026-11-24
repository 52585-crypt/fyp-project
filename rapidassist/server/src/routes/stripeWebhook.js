const express = require("express");
const mongoose = require("mongoose");
const { Payment } = require("../models/Payment");
const { Invoice } = require("../models/Invoice");
const { CommissionEntry } = require("../models/CommissionEntry");
const { StripeWebhookEvent } = require("../models/StripeWebhookEvent");
const { getStripe, signingSecret, paymentError, validateIntent, stripeCall } = require("../services/stripePayments");

const transitions = new Map([
  ["payment_intent.succeeded", { status: "paid", intentStatus: "succeeded" }],
  ["payment_intent.payment_failed", { status: "failed", intentStatus: "requires_payment_method" }],
  ["payment_intent.canceled", { status: "canceled", intentStatus: "canceled" }],
  ["payment_intent.processing", { status: "processing", intentStatus: "processing" }]
]);

async function applyEvent(event, stripe, session) {
  const intent = event.data.object;
  const { status, intentStatus } = transitions.get(event.type);
  const payment = await Payment.findOne({ method: "stripe", stripeIntentId: intent.id }).session(session);
  if (!payment) {
    const { rapidassist_payment: paymentId, rapidassist_attempt: attempt } = intent.metadata || {};
    if (typeof paymentId === "string" && mongoose.isObjectIdOrHexString(paymentId) && attempt &&
        await Payment.exists({ _id: paymentId, stripeAttemptId: attempt, stripeIntentId: { $exists: false } }).session(session)) {
      throw paymentError("PaymentIntent is still being linked. Retry delivery.", 503);
    }
    return "unmatched";
  }
  if (!validateIntent(intent, payment) || intent.status !== intentStatus ||
      (status === "paid" && intent.amount_received !== payment.amountMinor)) return "mismatch";
  if (payment.status === "paid" || payment.status === "canceled") return "stale";
  if (status === "processing" || status === "failed") {
    if (event.created < payment.stripeEventCreated) return "stale";
    if (event.created === payment.stripeEventCreated) {
      const current = await stripeCall(() => stripe.paymentIntents.retrieve(intent.id));
      if (!validateIntent(current, payment) || current.status !== intentStatus) return "stale";
    }
  }

  payment.status = status;
  payment.stripeEventCreated = event.created;
  if (status === "paid") {
    const invoice = await Invoice.findOne({
      _id: payment.invoiceId, requestId: payment.requestId, userId: payment.userId,
      providerId: payment.providerId, totalMinor: payment.amountMinor, currency: payment.currency,
      status: "finalized", stripePaidAt: { $exists: false }
    }).session(session);
    if (!invoice || !Number.isSafeInteger(invoice.serviceFeeMinor) || invoice.serviceFeeMinor < 0 ||
        invoice.serviceFeeMinor > payment.amountMinor) {
      throw paymentError("The linked invoice needs reconciliation.", 503);
    }

    const paidAt = new Date(event.created * 1000);
    const commissionMinor = invoice.serviceFeeMinor;
    payment.paidAt = paidAt;
    if (typeof intent.latest_charge === "string") payment.stripeChargeId = intent.latest_charge;
    payment.providerNetMinor = payment.amountMinor - commissionMinor;
    invoice.stripePaidAt = paidAt;
    invoice.stripePaymentId = payment._id;
    await invoice.save({ session });
    await new CommissionEntry({
      _id: payment._id, invoiceId: invoice._id, providerId: payment.providerId,
      currency: payment.currency, grossMinor: payment.amountMinor, commissionMinor,
      providerNetMinor: payment.providerNetMinor, earnedAt: paidAt
    }).save({ session });
  }
  await payment.save({ session });
  return "applied";
}

async function recordEvent(event, stripe) {
  await Promise.all([Payment.init(), StripeWebhookEvent.init(), CommissionEntry.init()]);
  try {
    return await mongoose.connection.transaction(async (session) => {
      const previous = await StripeWebhookEvent.findById(event.id).session(session);
      if (previous) return previous.outcome;
      const outcome = await applyEvent(event, stripe, session);
      await new StripeWebhookEvent({
        _id: event.id, intentId: event.data.object.id, type: event.type,
        stripeCreated: event.created, outcome
      }).save({ session });
      return outcome;
    });
  } catch (error) {
    if (error.code === 11000) {
      const previous = await StripeWebhookEvent.findById(event.id);
      if (previous) return previous.outcome;
    }
    throw error;
  }
}

function mountStripeWebhook(app) {
  app.post("/api/payments/stripe/webhook", express.raw({ type: "application/json" }), async (req, res, next) => {
    try {
      const stripe = getStripe();
      const secret = signingSecret();
      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, req.get("stripe-signature"), secret);
      } catch {
        throw paymentError("Invalid Stripe webhook signature.", 400);
      }
      if (event.livemode !== false || !transitions.has(event.type)) return res.json({ received: true });

      const result = await recordEvent(event, stripe);
      if (result === "mismatch") throw paymentError("Stripe PaymentIntent does not match the payment.", 409);
      res.json({ received: true });
    } catch (error) { next(error); }
  });
}

module.exports = { mountStripeWebhook };
