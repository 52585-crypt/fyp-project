const mongoose = require("mongoose");

const invoiceLineSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    amountMinor: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    invoiceNumber: { type: String, required: true, unique: true },
    currency: { type: String, default: "PKR" },
    lines: { type: [invoiceLineSchema], required: true },
    totalMinor: { type: Number, required: true, min: 0 },
    serviceFeeMinor: { type: Number, default: 0, min: 0 },
    providerEarningsMinor: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["finalized", "void"], default: "finalized" },
    finalizedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

invoiceSchema.methods.toJSONSafe = function toJSONSafe() {
  return {
    id: this._id.toString(), requestId: this.requestId.toString(), invoiceNumber: this.invoiceNumber,
    currency: this.currency, lines: this.lines, totalMinor: this.totalMinor,
    serviceFeeMinor: this.serviceFeeMinor, providerEarningsMinor: this.providerEarningsMinor,
    status: this.status, finalizedAt: this.finalizedAt
  };
};

const Invoice = mongoose.model("Invoice", invoiceSchema);
module.exports = { Invoice };
