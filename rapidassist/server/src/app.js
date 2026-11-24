const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { trustedOrigins } = require("./config/origins");
const { errorHandler, notFound } = require("./middleware/error.middleware");

const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const vehiclesRoutes = require("./routes/vehicles.routes");
const requestsRoutes = require("./routes/requests.routes");
const notificationRoutes = require("./routes/notifications.routes");
const paymentRoutes = require("./routes/payments.routes");
const { mountStripeWebhook } = require("./routes/stripeWebhook");
const { createAiRouter } = require("./routes/ai.routes");
const { createLocationsRouter } = require("./routes/locations.routes");
const { createMechanicVerificationService } = require("./services/mechanicVerification");
const {
  createMechanicVerificationRouter, createAdminMechanicVerificationRouter
} = require("./routes/mechanicVerification.routes");

function buildCorsOptions() {
  const allowedOrigins = trustedOrigins();

  return {
    credentials: true,
    exposedHeaders: ["Retry-After", "X-Request-ID", "X-Admin-Audit-Status"],
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(Object.assign(new Error("Not allowed by CORS"), { statusCode: 403 }));
    }
  };
}

function createApp(options = {}) {
  const app = express();
  const mechanicVerification = options.mechanicVerification || createMechanicVerificationService();

  app.use(cors(buildCorsOptions()));
  mountStripeWebhook(app);
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "12mb" }));

  if (process.env.NODE_ENV !== "test") {
    app.use(morgan((tokens, req, res) => {
      const path = req.originalUrl.split("?")[0];
      const safeTokens = Object.assign(Object.create(tokens), { url: () => path });
      return morgan.dev(safeTokens, req, res);
    }));
  }

  app.get("/health", (req, res) => {
    res.json({ ok: true, name: "rapidassist-server" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/mechanic-verification", createMechanicVerificationRouter(mechanicVerification));
  app.use("/api/admin/providers/:id/verification", createAdminMechanicVerificationRouter(mechanicVerification));
  app.use("/api/admin", adminRoutes);
  app.use("/api/vehicles", vehiclesRoutes);
  app.use("/api/requests", requestsRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/locations", createLocationsRouter(options.places));
  app.use("/api/ai", createAiRouter(options.ai));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
