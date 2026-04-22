const mongoose = require("mongoose");
const { Vehicle, VEHICLE_TYPES } = require("../models/Vehicle");

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

function forbidden(message) {
  const err = new Error(message);
  err.statusCode = 403;
  return err;
}

function normalizeStr(v) {
  return v == null ? "" : String(v).trim();
}

function parseYear(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

async function createVehicle(req, res, next) {
  try {
    const { type, make, model, year, registrationNumber } = req.body || {};

    if (!type || !VEHICLE_TYPES.includes(type)) throw badRequest("Invalid vehicle type");
    if (!normalizeStr(make)) throw badRequest("Make is required");
    if (!normalizeStr(model)) throw badRequest("Model is required");

    const y = parseYear(year);
    if (!y || y < 1970 || y > new Date().getFullYear() + 1) throw badRequest("Invalid year");

    const vehicle = await Vehicle.create({
      userId: req.user._id,
      type,
      make: normalizeStr(make),
      model: normalizeStr(model),
      year: y,
      registrationNumber: normalizeStr(registrationNumber) || null
    });

    res.status(201).json({ ok: true, vehicle: vehicle.toJSONSafe() });
  } catch (err) {
    next(err);
  }
}

async function listMyVehicles(req, res, next) {
  try {
    const vehicles = await Vehicle.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ ok: true, vehicles: vehicles.map((v) => v.toJSONSafe()) });
  } catch (err) {
    next(err);
  }
}

async function updateVehicle(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid vehicle id");

    const vehicle = await Vehicle.findById(id);
    if (!vehicle) throw notFound("Vehicle not found");
    if (vehicle.userId.toString() !== req.user._id.toString()) throw forbidden("Forbidden");

    const { type, make, model, year, registrationNumber } = req.body || {};

    if (type !== undefined) {
      if (!VEHICLE_TYPES.includes(type)) throw badRequest("Invalid vehicle type");
      vehicle.type = type;
    }
    if (make !== undefined) {
      if (!normalizeStr(make)) throw badRequest("Make is required");
      vehicle.make = normalizeStr(make);
    }
    if (model !== undefined) {
      if (!normalizeStr(model)) throw badRequest("Model is required");
      vehicle.model = normalizeStr(model);
    }
    if (year !== undefined) {
      const y = parseYear(year);
      if (!y || y < 1970 || y > new Date().getFullYear() + 1) throw badRequest("Invalid year");
      vehicle.year = y;
    }
    if (registrationNumber !== undefined) {
      vehicle.registrationNumber = normalizeStr(registrationNumber) || null;
    }

    await vehicle.save();
    res.json({ ok: true, vehicle: vehicle.toJSONSafe() });
  } catch (err) {
    next(err);
  }
}

async function deleteVehicle(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) throw badRequest("Invalid vehicle id");

    const vehicle = await Vehicle.findById(id);
    if (!vehicle) throw notFound("Vehicle not found");
    if (vehicle.userId.toString() !== req.user._id.toString()) throw forbidden("Forbidden");

    await Vehicle.deleteOne({ _id: vehicle._id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { createVehicle, listMyVehicles, updateVehicle, deleteVehicle };

