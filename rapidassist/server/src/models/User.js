const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const USER_ROLES = ["user", "mechanic", "admin"];
const AUTH_PROVIDERS = ["local", "google"];
const VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected"];
const MECHANIC_SERVICE_CATEGORIES = ["mechanic", "fuel_delivery", "towing"];
const IDENTITY_MATCH_STATUSES = ["pending", "matched", "mismatch", "manual_review"];

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: USER_ROLES, required: true },

    name: { type: String, required: true, trim: true },
    phone: {
      type: String,
      default: null,
      required() { return this.authProvider !== "google"; },
      trim: true
    },
    email: {
      type: String,
      default: null,
      required() { return this.authProvider === "google"; },
      lowercase: true,
      trim: true
    },
    googleId: {
      type: String,
      default: null,
      required() { return this.authProvider === "google"; },
      select: false
    },
    authProvider: { type: String, enum: AUTH_PROVIDERS, default: "local", required: true },
    passwordHash: {
      type: String,
      default: null,
      required() { return this.authProvider !== "google"; },
      select: false
    },

    // Mechanic trust/verification (hybrid)
    isCertified: { type: Boolean, default: false },
    certificateUrl: { type: String, default: null },
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: "unverified"
    },
    mechanicProfile: {
      serviceCategory: {
        type: String,
        enum: MECHANIC_SERVICE_CATEGORIES,
        default: null
      },
      selfieUrl: { type: String, default: null },
      idCardFrontUrl: { type: String, default: null },
      idCardBackUrl: { type: String, default: null },
      workshopPhotoUrl: { type: String, default: null },
      certificateUrl: { type: String, default: null },
      drivingLicenseUrl: { type: String, default: null },
      liveLocation: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
        addressText: { type: String, default: null, trim: true },
        capturedAt: { type: Date, default: null }
      },
      identityMatch: {
        status: {
          type: String,
          enum: IDENTITY_MATCH_STATUSES,
          default: "pending"
        },
        score: { type: Number, default: null },
        provider: { type: String, default: null },
        checkedAt: { type: Date, default: null }
      }
    },

    // Trust signals (kept simple for v1)
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    completedJobs: { type: Number, default: 0 },
    complaintsCount: { type: Number, default: 0 },
    providerPerformance: {
      averageResponseSeconds: { type: Number, default: null },
      responseSamples: { type: Number, default: 0 },
      acceptedOffers: { type: Number, default: 0 },
      declinedOffers: { type: Number, default: 0 }
    },
    providerState: {
      isOnline: { type: Boolean, default: false },
      currentLocation: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
        addressText: { type: String, default: null, trim: true },
        accuracy: { type: Number, default: null },
        heading: { type: Number, default: null },
        speed: { type: Number, default: null },
        capturedAt: { type: Date, default: null },
        receivedAt: { type: Date, default: null },
        updatedAt: { type: Date, default: null }
      },
      activeRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", default: null },
      claimedAt: { type: Date, default: null },
      reservedRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", default: null },
      reservedOfferId: { type: String, default: null },
      reservedUntil: { type: Date, default: null },
      lastSeenAt: { type: Date, default: null }
    }
  },
  { timestamps: true }
);

userSchema.methods.verifyPassword = async function verifyPassword(password) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.hashPassword = async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

userSchema.index(
  { phone: 1 },
  { name: "phone_present_unique", unique: true, partialFilterExpression: { phone: { $type: "string" } } }
);

userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } }
);

userSchema.index(
  { googleId: 1 },
  { name: "google_id_present_unique", unique: true, partialFilterExpression: { googleId: { $type: "string" } } }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    role: this.role,
    name: this.name,
    phone: this.phone,
    email: this.email,
    authProvider: this.authProvider || "local",
    isCertified: this.isCertified,
    certificateUrl: this.certificateUrl,
    verificationStatus: this.verificationStatus,
    mechanicProfile: this.mechanicProfile
      ? {
          serviceCategory: this.mechanicProfile.serviceCategory,
          selfieUrl: this.mechanicProfile.selfieUrl,
          idCardFrontUrl: this.mechanicProfile.idCardFrontUrl,
          idCardBackUrl: this.mechanicProfile.idCardBackUrl,
          workshopPhotoUrl: this.mechanicProfile.workshopPhotoUrl,
          certificateUrl: this.mechanicProfile.certificateUrl,
          drivingLicenseUrl: this.mechanicProfile.drivingLicenseUrl,
          liveLocation: this.mechanicProfile.liveLocation,
          identityMatch: this.mechanicProfile.identityMatch
        }
      : null,
    ratingAvg: this.ratingAvg,
    ratingCount: this.ratingCount,
    completedJobs: this.completedJobs,
    complaintsCount: this.complaintsCount,
    providerPerformance: this.providerPerformance,
    providerState: this.providerState
      ? {
          isOnline: Boolean(this.providerState.isOnline),
          currentLocation: this.providerState.currentLocation,
          activeRequestId: this.providerState.activeRequestId ? this.providerState.activeRequestId.toString() : null,
          reservedRequestId: this.providerState.reservedRequestId ? this.providerState.reservedRequestId.toString() : null,
          reservedUntil: this.providerState.reservedUntil,
          lastSeenAt: this.providerState.lastSeenAt
        }
      : null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const User = mongoose.model("User", userSchema);

module.exports = { User, USER_ROLES, VERIFICATION_STATUSES, MECHANIC_SERVICE_CATEGORIES };
