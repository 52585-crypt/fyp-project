const mongoose = require("mongoose");

const REQUEST_CATEGORIES = ["car", "bike", "towing"];
const REQUEST_STATUSES = ["open", "cancelled", "completed"];

const serviceRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true },

    category: { type: String, enum: REQUEST_CATEGORIES, required: true },

    // When user doesn't know problem, keep unknownIssue=true and issueType can be null
    unknownIssue: { type: Boolean, default: false },
    issueType: { type: String, default: null, trim: true },
    description: { type: String, default: null, trim: true },

    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      addressText: { type: String, default: null, trim: true }
    },

    status: { type: String, enum: REQUEST_STATUSES, default: "open" }
  },
  { timestamps: true }
);

serviceRequestSchema.methods.toJSONSafe = function toJSONSafe() {
  return {
    id: this._id.toString(),
    userId: this.userId.toString(),
    vehicleId: this.vehicleId.toString(),
    category: this.category,
    unknownIssue: this.unknownIssue,
    issueType: this.issueType,
    description: this.description,
    location: this.location,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const ServiceRequest = mongoose.model("ServiceRequest", serviceRequestSchema);

module.exports = { ServiceRequest, REQUEST_CATEGORIES, REQUEST_STATUSES };

