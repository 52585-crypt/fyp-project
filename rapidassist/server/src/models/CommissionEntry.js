const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  // One immutable commission entry per payment.
  _id: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  currency: { type: String, required: true },
  grossMinor: { type: Number, required: true, min: 0 },
  commissionMinor: { type: Number, required: true, min: 0 },
  providerNetMinor: { type: Number, required: true, min: 0 },
  earnedAt: { type: Date, required: true }
}, { timestamps: true });

schema.index({ earnedAt: -1, _id: -1 });

module.exports = { CommissionEntry: mongoose.model("CommissionEntry", schema) };
