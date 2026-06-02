const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { createRequest, listMyRequests, listOpenRequests } = require("../controllers/requests.controller");

const router = express.Router();

router.use(requireAuth);

router.post("/", createRequest);
router.get("/", listMyRequests);
router.get("/open", listOpenRequests);

module.exports = router;

