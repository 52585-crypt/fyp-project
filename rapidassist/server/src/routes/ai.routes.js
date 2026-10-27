const express = require("express");
const { createServiceSuggestionController } = require("../controllers/ai.controller");
const { requireRole } = require("../middleware/auth.middleware");
const { createAiRateLimit } = require("../middleware/aiRateLimit.middleware");
const { suggestService: defaultSuggestService } = require("../services/serviceSuggestion");

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

  return router;
}

module.exports = { createAiRouter };
