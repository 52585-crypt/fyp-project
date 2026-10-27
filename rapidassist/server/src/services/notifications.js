const { Notification } = require("../models/Notification");
const { DeviceToken } = require("../models/DeviceToken");
const { notifyUser } = require("./realtime");

async function sendExpoPush(tokens, message) {
  if (!tokens.length || process.env.NODE_ENV === "test" || process.env.DISABLE_PUSH === "true") return;
  const payload = tokens.map((token) => ({
    to: token,
    sound: "default",
    title: message.title,
    body: message.body,
    data: message.data || {},
    channelId: "jobs"
  }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Expo push returned ${response.status}`);
    const result = await response.json();
    const tickets = Array.isArray(result?.data) ? result.data : [result?.data];
    const invalid = tickets.flatMap((ticket, index) => ticket?.details?.error === "DeviceNotRegistered" ? [tokens[index]] : []);
    if (invalid.length) await DeviceToken.deleteMany({ token: { $in: invalid } });
  } catch (error) {
    console.error("Push notification:", error.message);
  } finally {
    clearTimeout(timer);
  }
}

async function createNotification({ userId, type, title, body, data = {} }) {
  if (!userId) return null;
  const notification = await Notification.create({ userId, type, title, body, data });
  const safe = notification.toJSONSafe();
  notifyUser(userId, { notification: safe }, "notification:created");
  const devices = await DeviceToken.find({ userId }).select("token");
  void sendExpoPush(devices.map((device) => device.token), { title, body, data });
  return notification;
}

function createNotificationSafely(input) {
  void createNotification(input).catch((error) => console.error("Notification persistence:", error.message));
}

module.exports = { createNotification, createNotificationSafely };
