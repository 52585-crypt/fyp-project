const path = require("node:path");
const dotenv = require("dotenv");

function loadServerEnv({ development = false } = {}) {
  const envFiles = [path.resolve(__dirname, "../../.env")];
  if (development && process.env.NODE_ENV !== "production") {
    envFiles.unshift(path.resolve(__dirname, "../../.env.development.local"));
  }
  dotenv.config({ path: envFiles });
}

module.exports = { loadServerEnv };
