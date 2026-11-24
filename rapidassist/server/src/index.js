require("dotenv").config();

const { createApp } = require("./app");
const { connectDB } = require("./config/db");

async function main() {
  const port = process.env.PORT || 4000;

  await connectDB(process.env.MONGODB_URI);

  const app = createApp();
  app.listen(port, () => {
    // Intentionally simple log (FYP)
    console.log(`RapidAssist API running on port ${port}`);

    // Warm up the free AI models in the background so the first request is fast.
    if (process.env.AI_PRELOAD !== "false") {
      require("./services/faceVerification.service")
        .loadModels()
        .then(() => console.log("Face models ready"))
        .catch((err) => console.warn("Face models failed to load:", err.message));
      require("./services/vehicleIssueClassifier.service")
        .loadClassifier()
        .then(() => console.log("Vehicle issue (CLIP) model ready"))
        .catch((err) => console.warn("CLIP model failed to load:", err.message));
    }
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

