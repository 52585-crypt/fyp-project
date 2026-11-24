const express = require("express");
const { createServiceSuggestionController } = require("../controllers/ai.controller");
const { requireRole } = require("../middleware/auth.middleware");
const { createAiRateLimit } = require("../middleware/aiRateLimit.middleware");
const { suggestService: defaultSuggestService } = require("../services/serviceSuggestion");
const { classifyVehicleIssue: defaultClassifyVehicleIssue } = require("../services/vehicleIssueClassifier.service");

function createAiRouter(options = {}) {
  const router = express.Router();
  const suggestService = options.suggestService || defaultSuggestService;
  const rateLimit = createAiRateLimit(options.rateLimit);

  router.post(
    "/service-suggestion",
    ...requireRole("user"),
    rateLimit,
    createServiceSuggestionController({ suggestService })
  );

  // Free, local CLIP model: suggests the service (and mechanic issue) from a photo of the problem.
  // Body: { image: "data:image/jpeg;base64,..." }. The customer can always change the suggestion.
  const classifyVehicleIssue = options.classifyVehicleIssue || defaultClassifyVehicleIssue;
  const photoRateLimit = createAiRateLimit(options.photoRateLimit);
  router.post("/vehicle-issue", ...requireRole("user"), photoRateLimit, async (req, res, next) => {
    try {
      res.json({ ok: true, result: await classifyVehicleIssue(req.body?.image) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createAiRouter };
