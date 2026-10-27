const mongoose = require("mongoose");

const componentSchema = new mongoose.Schema(
  {
    proximity: { type: Number, required: true },
    rating: { type: Number, required: true },
    experience: { type: Number, required: true },
    responseSpeed: { type: Number, required: true }
  },
  { _id: false }
);

const ROUTE_SOURCES = ["osrm", "haversine_fallback", "provided"];

const dispatchOfferSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", required: true, index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    offerId: { type: String, required: true, unique: true },
    algorithmVersion: { type: String, default: "weighted-v2" },
    batchId: { type: String, default: null, index: true },
    priority: { type: String, enum: ["normal", "high", "urgent"], default: "normal" },
    distanceKm: { type: Number, required: true },
    routeDistanceKm: { type: Number, default: null },
    travelDurationSeconds: { type: Number, default: null },
    routeSource: { type: String, enum: ROUTE_SOURCES, default: "haversine_fallback" },
    assignmentCost: { type: Number, default: null },
    waitingCost: { type: Number, default: null },
    baselineNearestDistanceKm: { type: Number, default: null },
    score: { type: Number, required: true },
    components: { type: componentSchema, required: true },
    offeredAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    outcome: {
      type: String,
      enum: ["offered", "accepted", "declined", "expired", "withdrawn"],
      default: "offered",
      index: true
    },
    respondedAt: { type: Date, default: null },
    responseSeconds: { type: Number, default: null }
  },
  { timestamps: true }
);

dispatchOfferSchema.index({ requestId: 1, providerId: 1, offeredAt: -1 });

const DispatchOffer = mongoose.model("DispatchOffer", dispatchOfferSchema);

module.exports = { DispatchOffer };
