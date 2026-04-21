const mongoose = require("mongoose");

async function connectDB(uri) {
  if (!uri) {
    const err = new Error("MONGODB_URI is missing");
    err.statusCode = 500;
    throw err;
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri);
  return mongoose.connection;
}

module.exports = { connectDB };

