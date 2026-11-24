/*
 * Create (or reset the password of) an admin account.
 *
 *   npm run create-admin -- --name "Admin" --phone 03001234567 --password "S3cure!pass"
 *
 * Values can also come from ADMIN_NAME / ADMIN_PHONE / ADMIN_PASSWORD in .env.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../src/config/db");
const { User } = require("../src/models/User");

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const name = (arg("name") || process.env.ADMIN_NAME || "RapidAssist Admin").trim();
  const phone = (arg("phone") || process.env.ADMIN_PHONE || "").trim();
  const password = arg("password") || process.env.ADMIN_PASSWORD || "";

  if (phone.length < 10) throw new Error("Admin phone is required (--phone or ADMIN_PHONE), at least 10 digits");
  if (password.length < 8) throw new Error("Admin password must be at least 8 characters (--password or ADMIN_PASSWORD)");

  await connectDB(process.env.MONGODB_URI);

  const existing = await User.findOne({ phone });
  if (existing && existing.role !== "admin") {
    throw new Error(`Phone ${phone} already belongs to a ${existing.role} account. Use a different phone for the admin.`);
  }

  const passwordHash = await User.hashPassword(password);
  if (existing) {
    existing.name = name;
    existing.passwordHash = passwordHash;
    existing.isBlocked = false;
    await existing.save();
    console.log(`Updated admin account for ${phone}`);
  } else {
    await User.create({ role: "admin", name, phone, passwordHash });
    console.log(`Created admin account for ${phone}`);
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
