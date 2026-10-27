const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { errorHandler, notFound } = require("./middleware/error.middleware");

const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const vehiclesRoutes = require("./routes/vehicles.routes");
const requestsRoutes = require("./routes/requests.routes");
const notificationRoutes = require("./routes/notifications.routes");
const paymentRoutes = require("./routes/payments.routes");
const { createAiRouter } = require("./routes/ai.routes");

function buildCorsOptions() {
  const allowedOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    credentials: true,
    exposedHeaders: ["Retry-After"],
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(Object.assign(new Error("Not allowed by CORS"), { statusCode: 403 }));
    }
  };
}

function createApp(options = {}) {
  const app = express();

  app.use(cors(buildCorsOptions()));
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "12mb" }));

  if (process.env.NODE_ENV !== "test") {
    app.use(morgan("dev"));
  }

  app.get("/health", (req, res) => {
    res.json({ ok: true, name: "rapidassist-server" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/vehicles", vehiclesRoutes);
  app.use("/api/requests", requestsRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/ai", createAiRouter(options.ai));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
