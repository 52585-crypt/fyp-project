const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const USER_ROLES = ["user", "mechanic"];
const VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected"];
const MECHANIC_SERVICE_CATEGORIES = ["mechanic", "fuel_delivery", "towing"];
const IDENTITY_MATCH_STATUSES = ["pending", "matched", "mismatch", "manual_review"];

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: USER_ROLES, required: true },

    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true, select: false },

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
    complaintsCount: { type: Number, default: 0 }
    ,
    providerState: {
      isOnline: { type: Boolean, default: false },
      currentLocation: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
        addressText: { type: String, default: null, trim: true },
        updatedAt: { type: Date, default: null }
      },
      activeRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", default: null },
      lastSeenAt: { type: Date, default: null }
    }
  },
  { timestamps: true }
);

userSchema.methods.verifyPassword = async function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.hashPassword = async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    role: this.role,
    name: this.name,
    phone: this.phone,
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
          liveLocation: this.mechanicProfile.liveLocation,
          identityMatch: this.mechanicProfile.identityMatch
        }
      : null,
    ratingAvg: this.ratingAvg,
    ratingCount: this.ratingCount,
    completedJobs: this.completedJobs,
    complaintsCount: this.complaintsCount,
    providerState: this.providerState
      ? {
          isOnline: Boolean(this.providerState.isOnline),
          currentLocation: this.providerState.currentLocation,
          activeRequestId: this.providerState.activeRequestId ? this.providerState.activeRequestId.toString() : null,
          lastSeenAt: this.providerState.lastSeenAt
        }
      : null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const User = mongoose.model("User", userSchema);

module.exports = { User, USER_ROLES, VERIFICATION_STATUSES, MECHANIC_SERVICE_CATEGORIES };

