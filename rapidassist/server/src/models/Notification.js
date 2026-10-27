const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

notificationSchema.methods.toJSONSafe = function toJSONSafe() {
  return {
    id: this._id.toString(),
    type: this.type,
    title: this.title,
    body: this.body,
    data: this.data || {},
    readAt: this.readAt,
    createdAt: this.createdAt
  };
};

const Notification = mongoose.model("Notification", notificationSchema);
module.exports = { Notification };
