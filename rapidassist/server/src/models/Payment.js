const mongoose = require("mongoose");

const recordedCashFilter = {
  method: "cash",
  status: "paid",
  paidAt: { $type: "date" },
  collectedByUserId: { $type: "objectId" }
};

const paymentSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", required: true, unique: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    currency: { type: String, default: "PKR" },
    amountMinor: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ["cash", "online_simulated", "stripe"], required: true },
    status: { type: String, enum: ["pending", "processing", "paid", "failed", "canceled"], default: "pending", index: true },
    stripeIntentId: { type: String, unique: true, sparse: true },
    stripeChargeId: String,
    stripeAttemptId: String,
    stripeAttemptStartedAt: Date,
    stripeEventCreated: Number,
    providerNetMinor: { type: Number, min: 0 },
    paidAt: { type: Date, default: null },
    collectedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

paymentSchema.index({ createdAt: -1, _id: -1 });
paymentSchema.index({ method: 1, status: 1, paidAt: -1 });

paymentSchema.methods.toJSONSafe = function toJSONSafe() {
  return {
    id: this._id.toString(), requestId: this.requestId.toString(), invoiceId: this.invoiceId.toString(),
    currency: this.currency, amountMinor: this.amountMinor, method: this.method,
    status: this.status, paidAt: this.paidAt, createdAt: this.createdAt, updatedAt: this.updatedAt,
    cashCollectionRecorded: this.method === "cash" && this.status === "paid"
      && this.paidAt instanceof Date && Number.isFinite(this.paidAt.getTime())
      && mongoose.isObjectIdOrHexString(this.collectedByUserId),
    stripeIntentId: this.stripeIntentId || null, stripeChargeId: this.stripeChargeId || null
  };
};

const Payment = mongoose.model("Payment", paymentSchema);
module.exports = { Payment, recordedCashFilter };
