const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { PUBLIC_USER_ROLES, accountRoles } = require("../utils/accountRoles");

const USER_ROLES = ["user", "mechanic", "admin"];
const AUTH_PROVIDERS = ["local", "google"];
const VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected"];
const MECHANIC_SERVICE_CATEGORIES = ["mechanic", "fuel_delivery", "towing"];
const IDENTITY_MATCH_STATUSES = ["pending", "matched", "mismatch", "manual_review"];

const verificationImageSchema = new mongoose.Schema({
  key: { type: String, required: true },
  versionId: String
}, { _id: false });

// Free local face checks run on the verification selfies (head-turn liveness + duplicate account).
// passed = liveness ok, no duplicate | flagged = possible duplicate account | error = models failed (admin checks manually)
const FACE_CHECK_STATUSES = ["passed", "flagged", "error"];
const faceChecksSchema = new mongoose.Schema({
  status: { type: String, enum: FACE_CHECK_STATUSES, required: true },
  provider: { type: String, default: null },
  yaw: { front: Number, left: Number, right: Number },
  samePersonDistance: { left: Number, right: Number },
  duplicate: {
    found: { type: Boolean, default: false },
    matchedUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    matchedName: { type: String, default: null },
    matchedPhone: { type: String, default: null },
    distance: { type: Number, default: null }
  },
  error: { type: String, default: null },
  checkedAt: { type: Date, default: null }
}, { _id: false });

// GeoJSON point for the 2dsphere index ([lng, lat]); derived from providerState.currentLocation by the hooks below.
const pointSchema = new mongoose.Schema({
  type: { type: String, enum: ["Point"], required: true },
  coordinates: { type: [Number], required: true }
}, { _id: false });

function pointFromLocation(location) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (location?.lat == null || location?.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { type: "Point", coordinates: [lng, lat] };
}

const mechanicVerificationSchema = new mongoose.Schema({
  submissionId: String,
  reviewState: { type: String, enum: ["awaiting_review", "approved", "rejected", "resubmission_requested"] },
  consent: {
    version: String,
    grantedAt: Date
  },
  images: {
    profile: verificationImageSchema,
    // Head-turn liveness selfies (private S3, admin detail view only)
    profileLeft: verificationImageSchema,
    profileRight: verificationImageSchema,
    cnic: verificationImageSchema
  },
  // Admin-only: may name another provider when a duplicate face is found. mechanicVerification is select: false.
  faceChecks: { type: faceChecksSchema, default: undefined },
  cnicPortraitRegion: { left: Number, top: Number, width: Number, height: Number },
  retiredImages: { type: [verificationImageSchema], default: undefined },
  reviewedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewNote: String
}, { _id: false });

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: USER_ROLES, required: true },
    roles: { type: [{ type: String, enum: PUBLIC_USER_ROLES }], default: undefined },
    providerEnrollment: {
      type: new mongoose.Schema({ digest: String, expiresAt: Date }, { _id: false }),
      default: undefined,
      select: false
    },

    name: { type: String, required: true, trim: true },
    phone: {
      type: String,
      default: null,
      required() { return accountRoles(this).includes("mechanic") || this.authProvider !== "google"; },
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
    googleLinkedAt: { type: Date, default: null },
    profilePictureUrl: { type: String, default: null },
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
    mechanicVerification: { type: mechanicVerificationSchema, select: false, default: undefined },
    // 128-number face descriptor of the verified straight selfie, used only to detect one person opening several
    // provider accounts. Never sent to clients.
    faceDescriptor: { type: [Number], default: undefined, select: false },
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
      declinedOffers: { type: Number, default: 0 },
      // Offers that expired without an answer; counted against acceptance by smart matching.
      expiredOffers: { type: Number, default: 0 }
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
      // Same position as currentLocation, as GeoJSON for $geoNear; currentLocation.updatedAt is the last-location time.
      locationPoint: { type: pointSchema, default: undefined },
      // Seeded demo providers: shown on the customer map, never offered real jobs.
      isDemo: { type: Boolean, default: undefined },
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

userSchema.index({ "providerState.locationPoint": "2dsphere" });

// Keep providerState.locationPoint in sync with providerState.currentLocation however the location is written.
userSchema.pre("save", function syncLocationPoint() {
  if (!this.isModified("providerState.currentLocation")) return;
  const point = pointFromLocation(this.providerState?.currentLocation);
  this.set("providerState.locationPoint", point || undefined);
});

function syncLocationPointInUpdate() {
  const update = this.getUpdate();
  if (!update || Array.isArray(update)) return;
  const set = update.$set || {};
  const whole = set["providerState.currentLocation"] ?? update["providerState.currentLocation"];
  const lat = set["providerState.currentLocation.lat"];
  const lng = set["providerState.currentLocation.lng"];
  let point;
  if (whole !== undefined) point = pointFromLocation(whole);
  else if (lat !== undefined && lng !== undefined) point = pointFromLocation({ lat, lng });
  else return;
  if (point) update.$set = { ...set, "providerState.locationPoint": point };
  else update.$unset = { ...(update.$unset || {}), "providerState.locationPoint": 1 };
  this.setUpdate(update);
}
userSchema.pre("findOneAndUpdate", syncLocationPointInUpdate);
userSchema.pre("updateOne", syncLocationPointInUpdate);
userSchema.pre("updateMany", syncLocationPointInUpdate);

userSchema.methods.verifyPassword = async function verifyPassword(password) {
  if (this.authProvider === "google" || !this.passwordHash) return false;
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
// Support stable registration-date paging in the admin customer directory.
userSchema.index({ createdAt: -1, _id: -1 });

userSchema.methods.toSafeJSON = function toSafeJSON(activeRole = this.role) {
  const identityMatch = this.mechanicProfile?.identityMatch;
  return {
    id: this._id.toString(),
    role: activeRole,
    activeRole,
    roles: accountRoles(this),
    name: this.name,
    phone: this.phone,
    email: this.email,
    authProvider: this.authProvider || "local",
    hasGoogleSignIn: this.authProvider === "google" || Boolean(this.googleLinkedAt),
    profilePictureUrl: this.profilePictureUrl ?? null,
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
          identityMatch: identityMatch ? {
            status: identityMatch.status,
            provider: identityMatch.provider,
            checkedAt: identityMatch.checkedAt
          } : null
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

module.exports = { User, USER_ROLES, VERIFICATION_STATUSES, MECHANIC_SERVICE_CATEGORIES, pointFromLocation };
