const express = require("express");
const { readCoordinates } = require("../services/locationInput");
const { requireAuth } = require("../middleware/auth.middleware");
const { createLocationRateLimit } = require("../middleware/locationRateLimit.middleware");
const { autocompleteGooglePlaces: defaultAutocomplete } = require("../services/googlePlacesAutocomplete");
const { resolveGooglePlaceSelection: defaultResolveSelection, validatePlaceId, validateSessionToken } = require("../services/googlePlaceResolution");


function createLocationsRouter(options = {}) {
  const router = express.Router();
  const autocomplete = options.autocomplete || defaultAutocomplete;
  const resolveSelection = options.resolveSelection || defaultResolveSelection;
  const rateLimit = createLocationRateLimit(options.rateLimit);
  const sessions = new Map();
  const selectionsInProgress = new Set();
  const sessionTtlMs = 3 * 60 * 1000;
  router.use(requireAuth, rateLimit);

  router.post("/autocomplete", async (req, res, next) => {
    try {
      const input = typeof req.body?.input === "string" ? req.body.input.trim() : "";
      const sessionToken = typeof req.body?.sessionToken === "string" ? req.body.sessionToken.trim() : "";
      validateSessionToken(sessionToken);
      const near = req.body?.near == null ? null : readCoordinates(req.body.near.latitude, req.body.near.longitude);
      const latitude = near?.lat ?? null;
      const longitude = near?.lng ?? null;
      if (input.length < 3 || input.length > 120) throw Object.assign(new Error("Location query must be between 3 and 120 characters."), { statusCode: 400 });
      if (req.body?.near != null && (latitude == null || longitude == null)) throw Object.assign(new Error("Invalid location bias."), { statusCode: 400 });
      const suggestions = await autocomplete(input, sessionToken, {
        ...(latitude != null && longitude != null ? { near: { latitude, longitude } } : {})
      });
      const sessionKey = `${req.user._id}:${sessionToken}`;
      const existing = sessions.get(sessionKey);
      const placeIds = new Set(existing?.expiresAt > Date.now() ? existing.placeIds : []);
      suggestions.forEach((suggestion) => { if (suggestion?.provider === "google_places" && suggestion.id) placeIds.add(suggestion.id); });
      sessions.set(sessionKey, { placeIds, expiresAt: Date.now() + sessionTtlMs });
      res.json({ ok: true, provider: "google_places", suggestions });
    } catch (error) { next(error); }
  });

  router.post("/details", async (req, res, next) => {
    try {
      const placeId = typeof req.body?.placeId === "string" ? req.body.placeId.trim() : "";
      const sessionToken = typeof req.body?.sessionToken === "string" ? req.body.sessionToken.trim() : "";
      validatePlaceId(placeId);
      validateSessionToken(sessionToken);
      const sessionKey = `${req.user._id}:${sessionToken}`;
      const session = sessions.get(sessionKey);
      const expired = session && session.expiresAt <= Date.now();
      if (expired) sessions.delete(sessionKey);
      if (!session || expired || !session.placeIds.has(placeId) || selectionsInProgress.has(sessionKey)) {
        throw Object.assign(new Error("This place was not selected from the current autocomplete session."), { statusCode: 400 });
      }
      selectionsInProgress.add(sessionKey);
      try {
        const location = await resolveSelection(placeId, sessionToken);
        sessions.delete(sessionKey);
        res.json({ ok: true, location });
      } finally {
        selectionsInProgress.delete(sessionKey);
      }
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createLocationsRouter };
