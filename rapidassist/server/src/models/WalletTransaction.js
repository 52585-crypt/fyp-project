const mongoose = require("mongoose");

const WALLET_TRANSACTION_TYPES = ["commission_debit", "topup_credit", "adjustment"];
const WALLET_TRANSACTION_STATUSES = ["pending", "approved", "rejected"];
const TOPUP_METHODS = ["jazzcash", "easypaisa", "bank_transfer", "cash", "other"];

const walletTransactionSchema = new mongoose.Schema(
  {
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", default: null },
    type: { type: String, enum: WALLET_TRANSACTION_TYPES, required: true, index: true },
    // Signed amount: credit is positive, debit is negative.
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, default: null },
    status: { type: String, enum: WALLET_TRANSACTION_STATUSES, default: "approved", index: true },
    appliedToWallet: { type: Boolean, default: false },

    // Top-up (dues payment) details
    method: { type: String, enum: TOPUP_METHODS, default: null },
    reference: { type: String, default: null, trim: true, maxlength: 80 },
    proofImage: { type: String, default: null },

    // Snapshot of the request money split for commission entries
    breakdown: {
      category: { type: String, default: null },
      requestTotal: { type: Number, default: null },
      commission: { type: Number, default: null },
      platformFee: { type: Number, default: null },
      providerEarning: { type: Number, default: null }
    },

    note: { type: String, default: null, trim: true, maxlength: 300 },
    reviewNote: { type: String, default: null, trim: true, maxlength: 300 },
    reviewedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// A request can be charged commission only once, even if completion is retried.
walletTransactionSchema.index(
  { requestId: 1, type: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: "objectId" } } }
);
walletTransactionSchema.index({ providerId: 1, createdAt: -1 });

walletTransactionSchema.methods.toJSONSafe = function toJSONSafe({ includeProof = false } = {}) {
  const provider = this.providerId && this.providerId._id ? this.providerId : null;
  return {
    id: this._id.toString(),
    providerId: provider ? provider._id.toString() : this.providerId?.toString(),
    provider: provider ? { id: provider._id.toString(), name: provider.name, phone: provider.phone } : undefined,
    requestId: this.requestId ? this.requestId.toString() : null,
    type: this.type,
    amount: this.amount,
    balanceAfter: this.balanceAfter,
    status: this.status,
    method: this.method,
    reference: this.reference,
    hasProof: Boolean(this.proofImage),
    proofImage: includeProof ? this.proofImage : undefined,
    breakdown: this.breakdown,
    note: this.note,
    reviewNote: this.reviewNote,
    reviewedAt: this.reviewedAt,
    createdAt: this.createdAt
  };
};

const WalletTransaction = mongoose.model("WalletTransaction", walletTransactionSchema);

module.exports = {
  WalletTransaction,
  WALLET_TRANSACTION_TYPES,
  WALLET_TRANSACTION_STATUSES,
  TOPUP_METHODS
};
