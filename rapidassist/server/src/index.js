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
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

