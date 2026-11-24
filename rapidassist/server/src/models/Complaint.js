const mongoose = require("mongoose");

const COMPLAINT_CATEGORIES = [
  "provider_behavior",
  "overcharging",
  "late_arrival",
  "poor_service",
  "vehicle_damage",
  "payment",
  "safety",
  "app_issue",
  "other"
];
const COMPLAINT_STATUSES = ["open", "in_review", "resolved", "dismissed"];
const COMPLAINT_PRIORITIES = ["low", "normal", "high"];

const updateSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["note", "reply", "status"], required: true },
    text: { type: String, default: null, trim: true, maxlength: 1000 },
    // Internal notes are only visible to admins; replies and status changes are shown to the complainant.
    internal: { type: Boolean, default: false },
    status: { type: String, enum: COMPLAINT_STATUSES, default: null },
    byUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const complaintSchema = new mongoose.Schema(
  {
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    against: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", default: null, index: true },
    category: { type: String, enum: COMPLAINT_CATEGORIES, required: true },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: COMPLAINT_STATUSES, default: "open", index: true },
    priority: { type: String, enum: COMPLAINT_PRIORITIES, default: "normal" },
    // Numeric copy of priority so queues can sort high → low in the database.
    priorityRank: { type: Number, default: 1, index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolution: { type: String, default: null, trim: true, maxlength: 1000 },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updates: [updateSchema]
  },
  { timestamps: true }
);

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

complaintSchema.pre("validate", function setPriority(next) {
  // Safety issues jump the queue automatically.
  if (this.isNew && this.category === "safety") this.priority = "high";
  this.priorityRank = PRIORITY_RANK[this.priority] ?? 1;
  next();
});

const Complaint = mongoose.model("Complaint", complaintSchema);

module.exports = { Complaint, COMPLAINT_CATEGORIES, COMPLAINT_STATUSES, COMPLAINT_PRIORITIES };
