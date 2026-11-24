const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const Stripe = require("stripe");
const { Invoice } = require("../models/Invoice");
const { Payment } = require("../models/Payment");
const { ServiceRequest } = require("../models/ServiceRequest");

const retryWindowMs = 23 * 60 * 60 * 1000;

function paymentError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode, expose: true, publicMessage: message });
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim() || "";
  if (!/^(sk|rk)_test_/.test(key)) throw paymentError("Stripe test payments are unavailable.", 503);
  return new Stripe(key, { apiVersion: "2025-09-30.clover", maxNetworkRetries: 2, timeout: 10000 });
}

function signingSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || "";
  if (!secret.startsWith("whsec_")) throw paymentError("Stripe webhook signing is not configured.", 503);
  return secret;
}

async function stripeCall(operation) {
  try {
    return await operation();
  } catch (error) {
    if (["amount_too_small", "amount_too_large", "currency_not_supported", "payment_method_currency_mismatch"].includes(error.code)) {
      throw paymentError("Stripe cannot accept this invoice amount and currency in the configured sandbox.", 422);
    }
    // Stripe errors can contain request data and PaymentIntent client secrets.
    throw paymentError("Stripe test checkout is temporarily unavailable. Please retry.", 503);
  }
}

function validateIntent(intent, payment) {
  return intent?.livemode === false &&
    intent.id === payment.stripeIntentId &&
    intent.amount === payment.amountMinor &&
    intent.currency === payment.currency.toLowerCase();
}

function newAttempt() {
  return { stripeAttemptId: randomUUID(), stripeAttemptStartedAt: new Date() };
}

async function reservePayment(invoice) {
  const requestId = invoice.requestId;
  const existing = await Payment.findOne({ requestId });
  if (existing) return existing;

  try {
    return await Payment.create({
      requestId, invoiceId: invoice._id, userId: invoice.userId, providerId: invoice.providerId,
      amountMinor: invoice.totalMinor, currency: invoice.currency, method: "stripe", status: "pending",
      ...newAttempt()
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const competingPayment = await Payment.findOne({ requestId });
    if (!competingPayment) throw error;
    return competingPayment;
  }
}

async function createStripeIntent(invoiceId, userId) {
  if (typeof invoiceId !== "string" || !mongoose.isObjectIdOrHexString(invoiceId)) {
    throw paymentError("Invalid invoice ID.", 400);
  }
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw paymentError("Invoice not found.", 404);
  if (!invoice.userId.equals(userId)) throw paymentError("Forbidden", 403);

  const request = await ServiceRequest.findOne({
    _id: invoice.requestId, status: "completed", userId, providerId: invoice.providerId
  });
  if (!request || invoice.status !== "finalized" || invoice.stripePaidAt) {
    throw paymentError("This invoice is not eligible for payment.", 409);
  }
  // RapidAssist invoices use PKR minor units throughout the accounting system.
  if (invoice.currency !== "PKR" || !Number.isSafeInteger(invoice.totalMinor) ||
      invoice.totalMinor < 1 || invoice.totalMinor > 99_999_999) {
    throw paymentError("Stripe test checkout requires a valid PKR invoice.", 422);
  }
  if (!Number.isSafeInteger(invoice.serviceFeeMinor) || invoice.serviceFeeMinor < 0 ||
      invoice.serviceFeeMinor > invoice.totalMinor) {
    throw paymentError("This invoice needs accounting review before checkout.", 409);
  }
  const stripe = getStripe();
  signingSecret();
  const topology = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!topology.setName && topology.msg !== "isdbgrid") {
    throw paymentError("Stripe payment confirmation requires a MongoDB replica set or sharded cluster.", 503);
  }

  await Payment.init();
  let payment = await reservePayment(invoice);
  if (payment.status === "paid") throw paymentError("This invoice is already paid.", 409);
  if (payment.method !== "stripe") throw paymentError("A payment method is already selected for this invoice.", 409);
  if (!payment.invoiceId.equals(invoice._id) || !payment.userId.equals(userId) ||
      !payment.providerId.equals(invoice.providerId) || payment.amountMinor !== invoice.totalMinor ||
      payment.currency !== invoice.currency) {
    throw paymentError("The invoice has changed since checkout started.", 409);
  }

  if (payment.status === "canceled") {
    const renewed = await Payment.findOneAndUpdate(
      { _id: payment._id, status: "canceled", stripeAttemptId: payment.stripeAttemptId },
      { $set: { status: "pending", ...newAttempt() }, $unset: { stripeIntentId: "", stripeEventCreated: "" } },
      { new: true }
    );
    payment = renewed || await Payment.findById(payment._id);
  }

  let intent;
  if (payment.stripeIntentId) {
    intent = await stripeCall(() => stripe.paymentIntents.retrieve(payment.stripeIntentId));
  } else {
    // Stripe guarantees idempotency keys for at least 24 hours. Leave a margin
    // and require reconciliation if an unbound attempt outlives that window.
    if (!payment.stripeAttemptId || !payment.stripeAttemptStartedAt ||
        Date.now() - payment.stripeAttemptStartedAt.getTime() >= retryWindowMs) {
      throw paymentError("This checkout requires reconciliation before it can be retried.", 409);
    }

    try {
      intent = await stripeCall(() => stripe.paymentIntents.create({
        amount: payment.amountMinor,
        currency: payment.currency.toLowerCase(),
        payment_method_types: ["card"],
        metadata: { rapidassist_payment: payment.id, rapidassist_attempt: payment.stripeAttemptId }
      }, { idempotencyKey: `rapidassist-${payment.id}-${payment.stripeAttemptId}` }));
    } catch (error) {
      // Explicit Stripe amount/currency rejection means no intent was created.
      if (error.statusCode === 422) {
        await Payment.deleteOne({
          _id: payment._id, stripeAttemptId: payment.stripeAttemptId, stripeIntentId: { $exists: false }
        });
      }
      throw error;
    }

    if (!validateIntent(intent, { ...payment.toObject(), stripeIntentId: intent.id })) {
      throw paymentError("Stripe returned an unexpected payment.", 502);
    }
    payment = await Payment.findOneAndUpdate(
      { _id: payment._id, stripeAttemptId: payment.stripeAttemptId, status: "pending",
        $or: [{ stripeIntentId: { $exists: false } }, { stripeIntentId: intent.id }] },
      { $set: { stripeIntentId: intent.id } },
      { new: true }
    );
    if (!payment) throw paymentError("Checkout state changed. Refresh to see the latest status.", 409);
  }

  if (!validateIntent(intent, payment)) throw paymentError("Stripe returned an unexpected payment.", 502);
  if (["succeeded", "processing", "canceled"].includes(intent.status)) {
    return { clientSecret: null, awaitingConfirmation: true };
  }
  if (!intent.client_secret || !["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) {
    throw paymentError("Stripe checkout is unavailable for this payment state.", 409);
  }
  return { clientSecret: intent.client_secret, awaitingConfirmation: false };
}

module.exports = { createStripeIntent, getStripe, signingSecret, paymentError, validateIntent, stripeCall };
