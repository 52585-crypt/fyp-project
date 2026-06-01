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
