const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const {
  acceptRequest,
  approveExtraWork,
  createRequest,
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

router.use(requireAuth);

router.post("/", createRequest);
router.get("/", listMyRequests);
router.get("/open", listOpenRequests);
router.get("/nearby-providers", listNearbyProviders);
router.get("/provider/active", getProviderActiveRequest);
router.get("/provider/history", getProviderHistory);
router.get("/provider/earnings", getProviderEarnings);
router.patch("/provider/availability", updateProviderAvailability);
router.patch("/provider/location", updateProviderLocation);
router.get("/:id", getRequest);
router.patch("/:id/accept", acceptRequest);
router.get("/:id/messages", getRequestMessages);
router.post("/:id/messages", sendRequestMessage);
router.patch("/:id/review", submitRequestReview);
router.patch("/:id/status", updateRequestStatus);
router.patch("/:id/extra-work", requestExtraWork);
router.patch("/:id/extra-work/approve", approveExtraWork);

module.exports = router;

