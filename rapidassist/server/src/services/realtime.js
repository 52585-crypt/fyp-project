const { Server } = require("socket.io");
const { verifyAccessToken } = require("../utils/jwt");
const { User } = require("../models/User");
const { isObjectIdOrHexString } = require("mongoose");
const { randomUUID } = require("node:crypto");
const { getAccessTokenFromCookies } = require("../utils/authCookie");
const { sessionRole } = require("../utils/accountRoles");
const { trustedOrigins, exactOrigin } = require("../config/origins");

let io;
function attachRealtime(server) {
  const origins = trustedOrigins();
  const trusted = origin => origin === undefined || origins.has(origin);
  // React Native sets Origin to the WebSocket endpoint. Allow that transport
  // for public bearer sessions only, without trusting forwarded host headers.
  const nativeOrigin = req => {
    const origin = exactOrigin(req.headers.origin);
    return Boolean(origin && origin.host === req.headers.host?.toLowerCase());
  };
  io = new Server(server, {
    cors: { origin: [...origins], credentials: true },
    allowRequest(req, callback) {
      callback(null, trusted(req.headers.origin) || nativeOrigin(req));
    }
  });
  io.use(async (socket, next) => {
    try {
      const explicitToken = socket.handshake.auth?.token;
      const trustedOrigin = trusted(socket.request.headers.origin);
      if (!trustedOrigin && (!nativeOrigin(socket.request) || !explicitToken)) throw new Error("Unauthorized");
      const token = explicitToken || getAccessTokenFromCookies(socket.request);
      const decoded = verifyAccessToken(token);
      if (!isObjectIdOrHexString(decoded?.sub) || !Number.isFinite(decoded.exp)) throw new Error("Unauthorized");
      const user = await User.findById(decoded.sub).select("_id role roles");
      const role = user && sessionRole(user, decoded.role);
      if (!role || (!trustedOrigin && role === "admin")) throw new Error("Unauthorized");
      socket.data.userId = user.id;
      socket.data.role = role;
      socket.data.expiresAt = decoded.exp * 1000;
      next();
    } catch { next(new Error("Unauthorized")); }
  });
  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`);
    if (socket.data.role === "admin") socket.join("admins");
    let timer;
    function scheduleExpiry() {
      const remaining = socket.data.expiresAt - Date.now();
      if (remaining <= 0) socket.disconnect(true);
      else timer = setTimeout(scheduleExpiry, Math.min(remaining, 2_147_483_647));
    }
    socket.on("disconnect", () => clearTimeout(timer));
    scheduleExpiry();
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
