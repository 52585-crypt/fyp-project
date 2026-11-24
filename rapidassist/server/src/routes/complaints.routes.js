const express = require("express");
const mongoose = require("mongoose");
const { requireAuth } = require("../middleware/auth.middleware");
const { Complaint, COMPLAINT_CATEGORIES } = require("../models/Complaint");
const { ServiceRequest } = require("../models/ServiceRequest");
const { User } = require("../models/User");

// Customer / provider facing complaint endpoints (mobile app).
const router = express.Router();
router.use(requireAuth);

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function complaintToUserJSON(complaint) {
  return {
    id: complaint._id.toString(),
    requestId: complaint.requestId ? complaint.requestId.toString() : null,
    category: complaint.category,
    description: complaint.description,
    status: complaint.status,
    resolution: complaint.resolution,
    resolvedAt: complaint.resolvedAt,
    // Never leak internal admin notes to the complainant.
    updates: (complaint.updates || [])
      .filter((u) => !u.internal)
      .map((u) => ({ type: u.type, text: u.text, status: u.status, at: u.at })),
    createdAt: complaint.createdAt,
    updatedAt: complaint.updatedAt
  };
}

router.post("/", async (req, res, next) => {
  try {
    const category = String(req.body?.category || "").trim();
    const description = String(req.body?.description || "").trim();
    const requestId = req.body?.requestId ? String(req.body.requestId) : null;

    if (!COMPLAINT_CATEGORIES.includes(category)) throw httpError(400, "Please choose what the problem is about");
    if (description.length < 10) throw httpError(400, "Please describe the problem (at least 10 characters)");
    if (description.length > 1000) throw httpError(400, "Description is too long (max 1000 characters)");

    let against = null;
    if (requestId) {
      if (!mongoose.isValidObjectId(requestId)) throw httpError(400, "Invalid request id");
      const request = await ServiceRequest.findById(requestId).select("userId providerId");
      if (!request) throw httpError(404, "Request not found");

      const me = req.user._id.toString();
      const isCustomer = request.userId.toString() === me;
      const isProvider = request.providerId && request.providerId.toString() === me;
      if (!isCustomer && !isProvider) throw httpError(403, "You can only report your own requests");
      against = isCustomer ? request.providerId : request.userId;

      const duplicate = await Complaint.exists({ raisedBy: req.user._id, requestId, status: { $in: ["open", "in_review"] } });
      if (duplicate) throw httpError(409, "You already have an open complaint for this request");
    }

    const complaint = await Complaint.create({
      raisedBy: req.user._id,
      against,
      requestId,
      category,
      description
    });

    if (against) await User.updateOne({ _id: against }, { $inc: { complaintsCount: 1 } });

    res.status(201).json({ ok: true, complaint: complaintToUserJSON(complaint) });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const complaints = await Complaint.find({ raisedBy: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json({ ok: true, complaints: complaints.map(complaintToUserJSON) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
