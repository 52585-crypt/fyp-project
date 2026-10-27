const { Server } = require("socket.io");
const { verifyAccessToken } = require("../utils/jwt");
const { User } = require("../models/User");
const { randomUUID } = require("node:crypto");
const { getAccessTokenFromCookies } = require("../utils/authCookie");

let io;
function attachRealtime(server) {
  const origins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  io = new Server(server, { cors: { origin: origins.length ? origins : true, credentials: true } });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || getAccessTokenFromCookies(socket.request);
      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.sub).select("_id role");
      if (!user) throw new Error("Unauthorized");
      socket.data.userId = user.id;
      socket.data.role = user.role;
      socket.data.expiresAt = decoded.exp * 1000;
      next();
    } catch { next(new Error("Unauthorized")); }
  });
  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`);
    if (socket.data.role === "admin") socket.join("admins");
    const timer = setTimeout(() => socket.disconnect(true), Math.max(0, socket.data.expiresAt - Date.now()));
    socket.on("disconnect", () => clearTimeout(timer));
  });
  return io;
}

function eventPayload(payload) {
  return {
    eventId: randomUUID(),
    emittedAt: new Date().toISOString(),
    ...payload
  };
}
function notifyUser(userId, payload, eventName = "request:changed") {
  if (userId) io?.to(`user:${userId}`).emit(eventName, eventPayload(payload));
}
function notifyAdmins(payload, eventName = "request:changed") {
  io?.to("admins").emit(eventName, eventPayload(payload));
}
function notifyRequest(request, kind = "status") {
  const payload = {
    requestId: request.id || String(request._id),
    kind,
    status: request.status,
    version: Number(request.dispatch?.version || request.__v || 0)
  };
  const recipients = new Set([request.userId, request.providerId, request.dispatch?.offeredProviderId].filter(Boolean).map(String));
  recipients.forEach((id) => notifyUser(id, payload));
  notifyAdmins(payload);
}
module.exports = { attachRealtime, notifyUser, notifyAdmins, notifyRequest };
