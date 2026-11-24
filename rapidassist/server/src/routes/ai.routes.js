const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { classifyVehicleIssue } = require("../services/vehicleIssueClassifier.service");

const router = express.Router();

// POST /api/ai/vehicle-issue  { image: "data:image/jpeg;base64,..." }
// Suggests the service category / mechanic issue from a photo of the problem.
router.post("/vehicle-issue", requireAuth, async (req, res, next) => {
  try {
    const result = await classifyVehicleIssue(req.body?.image);
    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
