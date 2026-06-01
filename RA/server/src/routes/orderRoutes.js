import { Router } from "express";
import {
  acceptOrder,
  completeOrder,
  confirmFuelDelivered,
  createOrder,
  customerConfirmPayment,
  getMyActiveOrder,
  getOrderHistory,
  getOrderDetails,
  listOpenOrders,
  markArrived,
  markFuelDelivered,
  providerConfirmPayment,
  raiseTowingSos,
  respondToExtraWorkRequest,
  startOrderProgress,
  submitExtraWorkRequest,
  updateProviderLocation,
} from "../controllers/orderController.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/mine/active", requireAuth, getMyActiveOrder);
router.get("/history", requireAuth, getOrderHistory);
router.get("/open", requireAuth, requireRole("provider"), listOpenOrders);
router.get("/:id", requireAuth, getOrderDetails);

router.post("/", requireAuth, requireRole("user"), createOrder);
router.post("/:id/accept", requireAuth, requireRole("provider"), acceptOrder);
router.post("/:id/arrive", requireAuth, requireRole("provider"), markArrived);
router.post("/:id/start", requireAuth, requireRole("provider"), startOrderProgress);
