const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const {
  createVehicle,
  listMyVehicles,
  updateVehicle,
  deleteVehicle
} = require("../controllers/vehicles.controller");

const router = express.Router();

router.use(requireAuth);

router.post("/", createVehicle);
router.get("/", listMyVehicles);
router.patch("/:id", updateVehicle);
router.delete("/:id", deleteVehicle);

module.exports = router;

