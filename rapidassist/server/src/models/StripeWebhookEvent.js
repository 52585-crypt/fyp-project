const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  _id: String,
  intentId: { type: String, required: true, index: true },
  type: { type: String, required: true },
  stripeCreated: { type: Number, required: true },
  outcome: { type: String, enum: ["applied", "stale", "unmatched", "mismatch"], required: true }
}, { timestamps: true });

module.exports = { StripeWebhookEvent: mongoose.model("StripeWebhookEvent", schema) };
