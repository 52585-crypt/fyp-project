const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const USER_ROLES = ["user", "mechanic"];
const VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected"];

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

    // Trust signals (kept simple for v1)
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    completedJobs: { type: Number, default: 0 },
    complaintsCount: { type: Number, default: 0 }
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
    ratingAvg: this.ratingAvg,
    ratingCount: this.ratingCount,
    completedJobs: this.completedJobs,
    complaintsCount: this.complaintsCount,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const User = mongoose.model("User", userSchema);

module.exports = { User, USER_ROLES, VERIFICATION_STATUSES };

