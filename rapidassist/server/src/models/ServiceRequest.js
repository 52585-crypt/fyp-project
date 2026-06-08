const mongoose = require("mongoose");

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
  "completed",
  "cancelled"
];

const FUEL_TYPES = ["petrol", "diesel"];
const MECHANIC_ISSUES = ["battery", "engine", "tyre", "brake", "overheating", "general_inspection"];

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    addressText: { type: String, default: null, trim: true }
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
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },

    category: { type: String, enum: REQUEST_CATEGORIES, required: true, index: true },

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
        approvedByUser: { type: Boolean, default: false }
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
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    review: { type: reviewSchema, default: null }
  },
  { timestamps: true }
);

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
    vehicleId: this.vehicleId ? this.vehicleId.toString() : null,
    category: this.category,
    vehicleInfo: this.vehicleInfo,
    pickupLocation: this.pickupLocation,
    destinationLocation: this.destinationLocation,
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
  MECHANIC_ISSUES
};

