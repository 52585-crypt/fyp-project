const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { createLocationRateLimit } = require("../middleware/locationRateLimit.middleware");
const {
  acceptRequest,
  declineRequest,
  retryDispatch,
  approveExtraWork,
  createRequest,
  refreshRequestLocation,
  getRequest,
  getProviderActiveRequest,
  getProviderEarnings,
  getProviderHistory,
  getRequestMessages,
  listNearbyProviders,
  listMyRequests,
  listOpenRequests,
  requestExtraWork,
  sendRequestMessage,
  submitRequestReview,
  updateProviderAvailability,
  updateProviderLocation,
  updateRequestStatus
} = require("../controllers/requests.controller");

const router = express.Router();

// Per-user limits. The app polls nearby providers every 20 s (Home: three services, so ~9 calls a minute) and
// sends provider locations every 10–15 s; these limits leave headroom for that and stop scraping or floods.
const nearbyProvidersRateLimit = createLocationRateLimit({
  envVar: "NEARBY_PROVIDERS_RATE_LIMIT_PER_MINUTE", defaultLimit: 60,
  message: "Too many nearby-provider requests. Please wait a moment and try again."
});
const providerLocationRateLimit = createLocationRateLimit({
  envVar: "PROVIDER_LOCATION_RATE_LIMIT_PER_MINUTE", defaultLimit: 30,
  message: "Location updates are arriving too fast. Updates will resume shortly."
});

router.use(requireAuth);

router.post("/", createRequest);
router.get("/", listMyRequests);
router.get("/open", listOpenRequests);
router.get("/nearby-providers", nearbyProvidersRateLimit, listNearbyProviders);
router.get("/provider/active", getProviderActiveRequest);
router.get("/provider/history", getProviderHistory);
router.get("/provider/earnings", getProviderEarnings);
router.patch("/provider/availability", updateProviderAvailability);
router.patch("/provider/location", providerLocationRateLimit, updateProviderLocation);
router.get("/:id", getRequest);
router.post("/:id/location/:field/refresh", refreshRequestLocation);
router.patch("/:id/accept", acceptRequest);
router.patch("/:id/decline", declineRequest);
router.post("/:id/dispatch/retry", retryDispatch);
router.get("/:id/messages", getRequestMessages);
router.post("/:id/messages", sendRequestMessage);
router.patch("/:id/review", submitRequestReview);
router.patch("/:id/status", updateRequestStatus);
router.patch("/:id/extra-work", requestExtraWork);
router.patch("/:id/extra-work/approve", approveExtraWork);

module.exports = router;
