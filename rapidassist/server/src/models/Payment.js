const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", required: true, unique: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    currency: { type: String, default: "PKR" },
    amountMinor: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ["cash", "online_simulated"], required: true },
    status: { type: String, enum: ["pending", "paid", "failed"], default: "pending", index: true },
    paidAt: { type: Date, default: null },
    collectedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

paymentSchema.methods.toJSONSafe = function toJSONSafe() {
  return {
    id: this._id.toString(), requestId: this.requestId.toString(), invoiceId: this.invoiceId.toString(),
    currency: this.currency, amountMinor: this.amountMinor, method: this.method,
    status: this.status, paidAt: this.paidAt, createdAt: this.createdAt
  };
};

const Payment = mongoose.model("Payment", paymentSchema);
module.exports = { Payment };
