const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { createRequest, listMyRequests } = require("../controllers/requests.controller");

const router = express.Router();

router.use(requireAuth);

router.post("/", createRequest);
router.get("/", listMyRequests);

module.exports = router;

