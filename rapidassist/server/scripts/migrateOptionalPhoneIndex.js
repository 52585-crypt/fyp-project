require("dotenv").config();

const mongoose = require("mongoose");
const { connectDB } = require("../src/config/db");

async function migrateOptionalPhoneIndex(collection) {
  const indexes = await collection.indexes().catch((error) => {
    if (error.codeName === "NamespaceNotFound") return [];
    throw error;
  });

  // Build the replacement first so existing phone uniqueness stays protected.
  await collection.createIndex(
    { phone: 1 },
    { name: "phone_present_unique", unique: true, partialFilterExpression: { phone: { $type: "string" } } }
  );

  const legacy = indexes.find((index) => index.name === "phone_1");
  if (legacy) {
    if (!legacy.unique || legacy.partialFilterExpression || legacy.key?.phone !== 1) {
      throw new Error("phone_1 has unexpected options; inspect it before removing it");
    }
    await collection.dropIndex("phone_1");
  }

  await collection.updateMany(
    { authProvider: { $exists: false } },
    { $set: { authProvider: "local" } }
  );

}

async function main() {
  await connectDB(process.env.MONGODB_URI);
  await migrateOptionalPhoneIndex(mongoose.connection.db.collection("users"));
  console.log("Phone index is ready, and existing accounts are marked as local.");
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error("Phone index migration failed:", error);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { migrateOptionalPhoneIndex };
