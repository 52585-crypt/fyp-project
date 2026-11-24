const mongoose = require("mongoose");

const categoryNumberSchema = new mongoose.Schema(
  {
    car_towing: { type: Number, min: 0 },
    fuel_delivery: { type: Number, min: 0 },
    mechanic: { type: Number, min: 0 }
  },
  { _id: false }
);

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    monetization: {
      commissionRates: { type: categoryNumberSchema, default: () => ({}) },
      platformFees: { type: categoryNumberSchema, default: () => ({}) },
      providerDebtLimit: { type: Number, min: 0, default: null },
      minTopupAmount: { type: Number, min: 0, default: null }
    }
  },
  { timestamps: true }
);

const PlatformSettings = mongoose.model("PlatformSettings", platformSettingsSchema);

module.exports = { PlatformSettings };
