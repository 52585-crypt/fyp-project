const mongoose = require("mongoose");
const { serializeLocation } = require("../services/googleLocationPolicy");

const REQUEST_CATEGORIES = ["car_towing", "fuel_delivery", "mechanic"];

const REQUEST_STATUSES = [
  "pending",
  "searching_provider",
  "provider_assigned",
  "provider_on_way",
  "provider_arrived",
  "in_progress",
  "waiting_user_approval",
  "vehicle_loaded",
  "reached_destination",
  "fuel_delivered",
  "inspection_started",
  "extra_work_requested",
  "work_started",
  "service_finished",
  "completed",
  "cancelled"
];

const FUEL_TYPES = ["petrol", "diesel"];
const MECHANIC_ISSUES = ["battery", "engine", "tyre", "brake", "overheating", "general_inspection"];
const REQUEST_PRIORITIES = ["normal", "high", "urgent"];

const locationSchema = new mongoose.Schema(
  {
    // Compliant cleanup deliberately removes cached Google coordinates while
    // retaining the place ID. Every other location source still requires a
    // complete coordinate pair.
    lat: { type: Number, required() { return this.source !== "google_places"; } },
    lng: { type: Number, required() { return this.source !== "google_places"; } },
    addressText: { type: String, default: null, trim: true },
    source: { type: String, enum: ["gps", "manual_map", "google_places", "photon"], default: null },
    placeId: { type: String, default: null, trim: true, maxlength: 512 },
    googleContentCachedAt: { type: Date, default: null }
  },
  { _id: false }
);

const priceLineSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const statusTimelineSchema = new mongoose.Schema(
  {
    status: { type: String, enum: REQUEST_STATUSES, required: true },
    note: { type: String, default: null, trim: true },
    at: { type: Date, default: Date.now },
    byUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    rating: { type: Number, min: 1, max: 5, default: null },
    comment: { type: String, default: null, trim: true, maxlength: 400 },
    byUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null }
  },
  { _id: false }
);

const serviceRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    clientRequestId: { type: String },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    assignmentActive: { type: Boolean, default: false },
    dispatch: {
      enabled: { type: Boolean, default: false },
      state: { type: String, enum: ["searching", "offered", "unavailable", "assigned", "cancelled"], default: "searching" },
      version: { type: Number, default: 0 },
      offerId: { type: String, default: null },
      offeredProviderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      offeredAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
      deadline: { type: Date, default: null },
      nextAttemptAt: { type: Date, default: null },
      attemptedProviderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      radiusKm: { type: Number, default: 5 }
    },
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },

    category: { type: String, enum: REQUEST_CATEGORIES, required: true, index: true },
    priority: { type: String, enum: REQUEST_PRIORITIES, default: "normal", index: true },

    vehicleInfo: {
      type: { type: String, default: null, trim: true },
      make: { type: String, default: null, trim: true },
      model: { type: String, default: null, trim: true },
      registrationNumber: { type: String, default: null, trim: true }
    },

    pickupLocation: { type: locationSchema, required: true },
    destinationLocation: { type: locationSchema, default: null },

    issueType: { type: String, default: null, trim: true },
    description: { type: String, default: null, trim: true },
    photos: [{ type: String, trim: true }],

    fuelDetails: {
      fuelType: { type: String, enum: FUEL_TYPES, default: null },
      liters: { type: Number, default: null, min: 1, max: 50 }
    },

    mechanicDetails: {
      issueCategory: { type: String, enum: MECHANIC_ISSUES, default: null },
      extraWork: {
        partName: { type: String, default: null, trim: true },
        partPrice: { type: Number, default: 0, min: 0 },
        laborCharge: { type: Number, default: 0, min: 0 },
        estimatedTime: { type: String, default: null, trim: true },
        description: { type: String, default: null, trim: true },
        approvedByUser: { type: Boolean, default: false },
        status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
        requestedAt: { type: Date, default: null },
        decidedAt: { type: Date, default: null }
      }
    },

    estimate: {
      currency: { type: String, default: "PKR" },
      lines: [priceLineSchema],
      total: { type: Number, default: 0, min: 0 }
    },

    status: { type: String, enum: REQUEST_STATUSES, default: "searching_provider", index: true },
    statusTimeline: [statusTimelineSchema],
    acceptedAt: { type: Date, default: null },
    // Set once, atomically, when the "provider is nearby" notification was sent (services/providerNearby.js).
    providerNearbyNotifiedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    review: { type: reviewSchema, default: null }
  },
  { timestamps: true }
);

// Enforce the invariant in MongoDB as well as in the provider reservation.
serviceRequestSchema.index({ providerId: 1, assignmentActive: 1 }, { unique: true, partialFilterExpression: { assignmentActive: true } });
serviceRequestSchema.index({ userId: 1, clientRequestId: 1 }, { unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } } });
serviceRequestSchema.index({ "dispatch.enabled": 1, status: 1, "dispatch.nextAttemptAt": 1 });
// Support deterministic newest-first pagination and UTC date filtering.
serviceRequestSchema.index({ createdAt: -1, _id: -1 });

serviceRequestSchema.methods.addStatus = function addStatus(status, byUserId, note) {
  this.status = status;
  this.statusTimeline.push({ status, byUserId: byUserId || null, note: note || null, at: new Date() });
  if (status === "completed") this.completedAt = new Date();
  if (status === "cancelled") this.cancelledAt = new Date();
};

serviceRequestSchema.methods.toJSONSafe = function toJSONSafe() {
  return {
    id: this._id.toString(),
    userId: this.userId?.toString(),
    providerId: this.providerId ? this.providerId.toString() : null,
    dispatch: this.dispatch?.enabled ? {
      state: this.dispatch.state,
      offerId: this.dispatch.offerId,
      expiresAt: this.dispatch.expiresAt,
      offeredAt: this.dispatch.offeredAt,
      deadline: this.dispatch.deadline,
      attempts: this.dispatch.attemptedProviderIds?.length || 0,
      radiusKm: this.dispatch.radiusKm
    } : null,
    vehicleId: this.vehicleId ? this.vehicleId.toString() : null,
    category: this.category,
    priority: this.priority,
    vehicleInfo: this.vehicleInfo,
    pickupLocation: serializeLocation(this.pickupLocation),
    destinationLocation: serializeLocation(this.destinationLocation),
    issueType: this.issueType,
    description: this.description,
    photos: this.photos || [],
    fuelDetails: this.fuelDetails,
    mechanicDetails: this.mechanicDetails,
    estimate: this.estimate,
    status: this.status,
    statusTimeline: this.statusTimeline,
    acceptedAt: this.acceptedAt,
    completedAt: this.completedAt,
    cancelledAt: this.cancelledAt,
    review: this.review
      ? {
          rating: this.review.rating,
          comment: this.review.comment,
          byUserId: this.review.byUserId ? this.review.byUserId.toString() : null,
          reviewedAt: this.review.reviewedAt
        }
      : null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const ServiceRequest = mongoose.model("ServiceRequest", serviceRequestSchema);

module.exports = {
  ServiceRequest,
  REQUEST_CATEGORIES,
  REQUEST_STATUSES,
  FUEL_TYPES,
  MECHANIC_ISSUES,
  REQUEST_PRIORITIES
};
