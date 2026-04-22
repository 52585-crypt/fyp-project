const mongoose = require("mongoose");

const VEHICLE_TYPES = ["car", "bike", "towing"];

const vehicleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: VEHICLE_TYPES, required: true },
    make: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    registrationNumber: { type: String, default: null, trim: true }
  },
  { timestamps: true }
);

vehicleSchema.methods.toJSONSafe = function toJSONSafe() {
  return {
    id: this._id.toString(),
    userId: this.userId.toString(),
    type: this.type,
    make: this.make,
    model: this.model,
    year: this.year,
    registrationNumber: this.registrationNumber,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const Vehicle = mongoose.model("Vehicle", vehicleSchema);

module.exports = { Vehicle, VEHICLE_TYPES };

