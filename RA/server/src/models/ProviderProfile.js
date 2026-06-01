import mongoose from "mongoose";

const providerProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    workshopPicture: {
      type: String,
      default: null,
    },
    mechanicCertificateImage: {
      type: String,
      default: null,
    },
    cnicFrontImage: {
      type: String,
      default: null,
    },
    cnicBackImage: {
      type: String,
      default: null,
    },
    selfieImage: {
      type: String,
      default: null,
    },
    cnic: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },
    cnicVerificationStatus: {
      type: String,
      enum: ["verified", "rejected"],
      default: "rejected",
    },
    cnicVerificationReason: {
      type: String,
      default: null,
      maxlength: 500,
    },
    cnicVerificationProvider: {
      type: String,
      default: null,
      maxlength: 80,
    },
