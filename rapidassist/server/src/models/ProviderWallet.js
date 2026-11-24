const mongoose = require("mongoose");

// One wallet per provider.
// balance < 0 means the provider owes the platform (cash jobs collect the
// platform's share in the provider's hand). balance > 0 is advance credit.
const providerWalletSchema = new mongoose.Schema(
  {
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    currency: { type: String, default: "PKR" },
    balance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    totalPlatformRevenue: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    settledJobs: { type: Number, default: 0 },
    isBlocked: { type: Boolean, default: false, index: true },
    blockedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

providerWalletSchema.methods.toJSONSafe = function toJSONSafe(debtLimit) {
  const dues = this.balance < 0 ? Math.abs(this.balance) : 0;
  return {
    providerId: this.providerId?._id ? this.providerId._id.toString() : this.providerId?.toString(),
    currency: this.currency,
    balance: this.balance,
    dues,
    debtLimit: debtLimit ?? null,
    remainingLimit: debtLimit == null ? null : Math.max(0, debtLimit - dues),
    totalEarned: this.totalEarned,
    totalPlatformRevenue: this.totalPlatformRevenue,
    totalPaid: this.totalPaid,
    settledJobs: this.settledJobs,
    isBlocked: this.isBlocked,
    blockedAt: this.blockedAt,
    updatedAt: this.updatedAt
  };
};

const ProviderWallet = mongoose.model("ProviderWallet", providerWalletSchema);

module.exports = { ProviderWallet };
