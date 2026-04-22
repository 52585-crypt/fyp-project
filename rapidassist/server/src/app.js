const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const authRoutes = require("./routes/auth.routes");
const vehiclesRoutes = require("./routes/vehicles.routes");
const requestsRoutes = require("./routes/requests.routes");

function createApp() {
  const app = express();

  app.use(cors());
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
