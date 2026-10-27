const mongoose = require("mongoose");

const paymentAttemptSchema = new mongoose.Schema(
  {
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true, index: true },
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    idempotencyKey: { type: String, required: true },
    method: { type: String, enum: ["cash", "online_simulated"], required: true },
    outcome: { type: String, enum: ["pending", "paid", "failed"], required: true },
    processedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

paymentAttemptSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });

const PaymentAttempt = mongoose.model("PaymentAttempt", paymentAttemptSchema);
module.exports = { PaymentAttempt };
