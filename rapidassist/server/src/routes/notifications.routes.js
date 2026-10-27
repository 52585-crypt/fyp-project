const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { Notification } = require("../models/Notification");
const { DeviceToken } = require("../models/DeviceToken");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100);
    const unread = await Notification.countDocuments({ userId: req.user._id, readAt: null });
    res.json({ ok: true, unread, notifications: notifications.map((item) => item.toJSONSafe()) });
  } catch (error) { next(error); }
});

router.patch("/read-all", async (req, res, next) => {
  try {
    await Notification.updateMany({ userId: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.patch("/:id/read", async (req, res, next) => {
  try {
    const item = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: { readAt: new Date() } }, { new: true });
    if (!item) return res.status(404).json({ ok: false, message: "Notification not found" });
    res.json({ ok: true, notification: item.toJSONSafe() });
  } catch (error) { next(error); }
});

router.post("/device-tokens", async (req, res, next) => {
  try {
    const token = String(req.body?.token || "").trim();
    const platform = String(req.body?.platform || "").trim();
    if (!token.startsWith("ExponentPushToken[") && !token.startsWith("ExpoPushToken[")) {
      return res.status(400).json({ ok: false, message: "Invalid Expo push token" });
    }
    if (!["android", "ios"].includes(platform)) return res.status(400).json({ ok: false, message: "Invalid device platform" });
    await DeviceToken.findOneAndUpdate({ token }, { $set: { userId: req.user._id, platform, lastSeenAt: new Date() } }, { upsert: true, new: true });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.delete("/device-tokens", async (req, res, next) => {
  try {
    await DeviceToken.deleteMany({ userId: req.user._id, token: String(req.body?.token || "") });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = router;
