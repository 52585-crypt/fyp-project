const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const authRoutes = require("./routes/auth.routes");
const vehiclesRoutes = require("./routes/vehicles.routes");
const requestsRoutes = require("./routes/requests.routes");

function buildCorsOptions() {
  const allowedOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    }
  };
}

function createApp() {
  const app = express();

  app.use(cors(buildCorsOptions()));
  app.use(express.json({ limit: "1mb" }));

  if (process.env.NODE_ENV !== "test") {
    app.use(morgan("dev"));
  }

  app.get("/health", (req, res) => {
    res.json({ ok: true, name: "rapidassist-server" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/vehicles", vehiclesRoutes);
  app.use("/api/requests", requestsRoutes);

  // Basic error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.statusCode || 500;
    res.status(status).json({
      ok: false,
      message: err.message || "Server error"
    });
  });

  return app;
}

module.exports = { createApp };
