import mongoose from "mongoose";

const locationSchema = new mongoose.Schema(
  {
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    address: {
      type: String,
      default: null,
      trim: true,
      maxlength: 240,
    },
  },
  { _id: false }
);

const extraWorkItemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 400,
    },
    partsCost: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    laborCost: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    customerDecision: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    decisionAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: false }
);

const extraWorkRequestSchema = new mongoose.Schema(
  {
    providerNote: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "partially_approved", "rejected"],
      default: "pending",
    },
    requestedTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    approvedTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    items: {
      type: [extraWorkItemSchema],
      default: [],
    },
  },
  { timestamps: true }
);

const orderSchema = new mongoose.Schema(
  {
    orderNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    serviceCode: {
      type: String,
      enum: ["fuel_delivery", "car_towing", "mechanic"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "open",
        "assigned",
        "arrived",
        "inspection_pending",
        "awaiting_extra_work_approval",
        "in_progress",
        "awaiting_fuel_confirmation",
        "tow_in_transit",
        "completed",
        "cancelled",
      ],
      default: "open",
      index: true,
    },
    pickupLocation: {
      type: locationSchema,
      required: true,
    },
    destinationLocation: {
      type: locationSchema,
      default: null,
    },
    customerVehicle: {
      make: {
        type: String,
        default: null,
        trim: true,
        maxlength: 80,
      },
      model: {
        type: String,
        default: null,
        trim: true,
