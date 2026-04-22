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

module.exports = { createRequest, listMyRequests };

