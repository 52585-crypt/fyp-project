const mongoose = require("mongoose");
const { ServiceRequest, REQUEST_CATEGORIES } = require("../models/ServiceRequest");
const { Vehicle } = require("../models/Vehicle");

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

function requireMechanic(req) {
  if (req.user?.role !== "mechanic") {
    throw forbidden("Forbidden");
  }
}

function normalizeStr(v) {
  return v == null ? "" : String(v).trim();
}

function parseNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

async function createRequest(req, res, next) {
  try {
    const { vehicleId, category, unknownIssue, issueType, description, location } = req.body || {};

    if (!vehicleId || !mongoose.isValidObjectId(vehicleId)) throw badRequest("Invalid vehicleId");
    if (!category || !REQUEST_CATEGORIES.includes(category)) throw badRequest("Invalid category");

    const lat = parseNum(location?.lat);
    const lng = parseNum(location?.lng);
    if (lat == null || lng == null) throw badRequest("Location lat/lng required");

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) throw notFound("Vehicle not found");
    if (vehicle.userId.toString() !== req.user._id.toString()) throw forbidden("Forbidden");

    const isUnknown = Boolean(unknownIssue);
    const issue = normalizeStr(issueType) || null;

    if (!isUnknown && !issue) throw badRequest("issueType is required when unknownIssue is false");

    const sr = await ServiceRequest.create({
      userId: req.user._id,
      vehicleId: vehicle._id,
      category,
      unknownIssue: isUnknown,
      issueType: isUnknown ? issue : issue,
      description: normalizeStr(description) || null,
      location: {
        lat,
        lng,
        addressText: normalizeStr(location?.addressText) || null
      }
    });

    res.status(201).json({ ok: true, request: sr.toJSONSafe() });
  } catch (err) {
    next(err);
  }
}

async function listMyRequests(req, res, next) {
  try {
    const requests = await ServiceRequest.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ ok: true, requests: requests.map((r) => r.toJSONSafe()) });
  } catch (err) {
    next(err);
  }
}

async function listOpenRequests(req, res, next) {
  try {
    requireMechanic(req);

    const requests = await ServiceRequest.find({ status: "open" })
      .sort({ createdAt: -1 })
      .populate({
        path: "vehicleId",
        select: "type make model year registrationNumber"
      });

    const payload = requests.map((r) => ({
      id: r._id.toString(),
      category: r.category,
      unknownIssue: r.unknownIssue,
      issueType: r.issueType,
      location: {
        addressText: r.location?.addressText || null
      },
      createdAt: r.createdAt,
      vehicle: r.vehicleId
        ? {
            id: r.vehicleId._id.toString(),
            type: r.vehicleId.type,
            make: r.vehicleId.make,
            model: r.vehicleId.model,
            year: r.vehicleId.year,
            registrationNumber: r.vehicleId.registrationNumber || null
          }
        : null
    }));

    res.json({ ok: true, requests: payload });
  } catch (err) {
    next(err);
  }
}

module.exports = { createRequest, listMyRequests, listOpenRequests };

