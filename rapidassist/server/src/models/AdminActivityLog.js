const mongoose = require("mongoose");

const actions = {
  "admin.login": { resource: "session", label: "Admin sign-in" },
  "admin.logout": { resource: "session", label: "Admin sign-out" },
  "verification.approve": { resource: "provider", label: "Approve verification" },
  "verification.reject": { resource: "provider", label: "Reject verification" },
  "verification.resubmit": { resource: "provider", label: "Request resubmission" },
  "request.location_refresh": { resource: "service_request", label: "Refresh request location" },
  "cash.confirm": { resource: "service_request", label: "Confirm cash collection" }
};
const resources = [...new Set(Object.values(actions).map(action => action.resource))];
const results = ["success", "failed", "no_change"];

const schema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
  action: { type: String, enum: Object.keys(actions), required: true, immutable: true },
  resourceType: { type: String, enum: resources, required: true, immutable: true, validate(value) { return actions[this.action]?.resource === value; } },
  resourceId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
  result: { type: String, enum: results, required: true, immutable: true },
  httpStatus: { type: Number, min: 200, max: 599, required: true, immutable: true },
  requestId: { type: String, required: true, match: /^[a-f0-9-]{36}$/, immutable: true },
  createdAt: { type: Date, default: Date.now, immutable: true }
}, { strict: "throw", versionKey: false });

schema.index({ createdAt: -1, _id: -1 });
schema.index({ adminId: 1, createdAt: -1, _id: -1 });
schema.index({ action: 1, createdAt: -1, _id: -1 });
schema.index({ resourceId: 1, createdAt: -1, _id: -1 });
schema.index({ requestId: 1 }, { unique: true });

function appendOnly() {
  throw new Error("Admin activity entries are append-only.");
}
schema.pre("save", function guardSave() { if (!this.isNew) appendOnly(); });
schema.pre(["updateOne", "updateMany", "replaceOne", "findOneAndUpdate", "findOneAndReplace",
  "findOneAndDelete", "deleteOne", "deleteMany", "bulkWrite"], appendOnly);
schema.pre("deleteOne", { document: true, query: false }, appendOnly);

module.exports = { AdminActivityLog: mongoose.model("AdminActivityLog", schema), actions, resources, results };
