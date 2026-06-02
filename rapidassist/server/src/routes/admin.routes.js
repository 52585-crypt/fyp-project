const express = require("express");
const { ServiceRequest } = require("../models/ServiceRequest");
const { User } = require("../models/User");
const { Vehicle } = require("../models/Vehicle");

const router = express.Router();

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

router.get("/dashboard", async (req, res, next) => {
  try {
    const today = startOfToday();

    const [
      users,
      providers,
      vehicles,
      activeRequests,
      completedRequests,
      cancelledRequests,
      pendingProviders,
      todayRequests,
      requests
    ] = await Promise.all([
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: "mechanic" }),
      Vehicle.countDocuments({}),
      ServiceRequest.countDocuments({ status: { $nin: ["completed", "cancelled"] } }),
      ServiceRequest.countDocuments({ status: "completed" }),
      ServiceRequest.countDocuments({ status: "cancelled" }),
      User.countDocuments({ role: "mechanic", verificationStatus: "pending" }),
      ServiceRequest.countDocuments({ createdAt: { $gte: today } }),
      ServiceRequest.find({})
        .sort({ createdAt: -1 })
        .limit(8)
        .populate({ path: "userId", select: "name phone role" })
        .populate({ path: "providerId", select: "name phone role" })
    ]);

    const totalRevenueResult = await ServiceRequest.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$estimate.total" } } }
    ]);

    res.json({
      ok: true,
      stats: {
        users,
        providers,
        vehicles,
        activeRequests,
        completedRequests,
        cancelledRequests,
        pendingProviders,
        todayRequests,
        complaints: 0,
        revenue: totalRevenueResult[0]?.total || 0
      },
      recentRequests: requests.map((request) => ({
        ...request.toJSONSafe(),
        user: request.userId
          ? {
              id: request.userId._id.toString(),
              name: request.userId.name,
              phone: request.userId.phone
            }
          : null,
        provider: request.providerId
          ? {
              id: request.providerId._id.toString(),
              name: request.providerId.name,
              phone: request.providerId.phone
            }
          : null
      }))
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

