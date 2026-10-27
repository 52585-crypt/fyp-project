const { User } = require("../models/User");

async function ensureAdminAccount() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!email || !password) {
    console.warn("Admin login disabled: set ADMIN_EMAIL and ADMIN_PASSWORD.");
    return null;
  }
  if (password.length < 10) {
    throw new Error("ADMIN_PASSWORD must be at least 10 characters");
  }

  const phone = String(process.env.ADMIN_PHONE || "admin-system").trim();
  const name = String(process.env.ADMIN_NAME || "RapidAssist Admin").trim();
  const existing = await User.findOne({ $or: [{ email }, { phone }] }).select("+passwordHash");

  if (existing) {
    if (existing.role !== "admin") {
      throw new Error("ADMIN_EMAIL or ADMIN_PHONE belongs to a non-admin account");
    }
    const passwordMatches = await existing.verifyPassword(password);
    existing.email = email;
    existing.name = name;
    existing.phone = phone;
    if (!passwordMatches) existing.passwordHash = await User.hashPassword(password);
    await existing.save();
    return existing;
  }

  return User.create({
    role: "admin",
    name,
    phone,
    email,
    passwordHash: await User.hashPassword(password),
    verificationStatus: "verified"
  });
}

module.exports = { ensureAdminAccount };
