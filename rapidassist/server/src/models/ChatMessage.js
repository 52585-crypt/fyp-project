const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["user", "mechanic"], required: true },
    body: { type: String, required: true, trim: true, maxlength: 1000 }
  },
  { timestamps: true }
);

chatMessageSchema.methods.toJSONSafe = function toJSONSafe() {
  return {
    id: this._id.toString(),
    requestId: this.requestId?.toString(),
    senderId: this.senderId?._id ? this.senderId._id.toString() : this.senderId?.toString(),
    senderRole: this.senderRole,
    sender: this.senderId?._id
      ? {
          id: this.senderId._id.toString(),
          name: this.senderId.name,
          phone: this.senderId.phone,
          role: this.senderId.role
        }
      : null,
    body: this.body,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);

module.exports = { ChatMessage };
