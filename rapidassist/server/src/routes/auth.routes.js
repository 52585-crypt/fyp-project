const express = require("express");
const { User, USER_ROLES } = require("../models/User");
const { signAccessToken } = require("../utils/jwt");
const { requireAuth } = require("../middleware/auth.middleware");
const { setAccessTokenCookie } = require("../utils/authCookie");

const router = express.Router();

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

router.post("/register", async (req, res, next) => {
  try {
    const { role, name, phone, password, isCertified, certificateUrl } = req.body || {};

    if (!role || !USER_ROLES.includes(role)) throw badRequest("Invalid role");
    if (!name || String(name).trim().length < 2) throw badRequest("Name is required");
    if (!phone || String(phone).trim().length < 10) throw badRequest("Phone is required");
    if (!password || String(password).length < 6) throw badRequest("Password must be at least 6 characters");

    const existing = await User.findOne({ phone: String(phone).trim() });
    if (existing) {
      const err = new Error("Phone already registered");
      err.statusCode = 409;
      throw err;
    }

    const passwordHash = await User.hashPassword(String(password));

    const user = await User.create({
      role,
      name: String(name).trim(),
      phone: String(phone).trim(),
      passwordHash,
      isCertified: role === "mechanic" ? Boolean(isCertified) : false,
      certificateUrl: role === "mechanic" && certificateUrl ? String(certificateUrl) : null,
      verificationStatus: role === "mechanic" && isCertified ? "pending" : "unverified"
    });

    const token = signAccessToken({ sub: user._id.toString(), role: user.role });
    setAccessTokenCookie(res, token);

    res.status(201).json({
      ok: true,
      token,
      user: user.toSafeJSON()
    });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { phone, password } = req.body || {};
    if (!phone || !password) throw badRequest("Phone and password are required");

    const user = await User.findOne({ phone: String(phone).trim() }).select("+passwordHash");
    if (!user) {
      const err = new Error("Invalid credentials");
      err.statusCode = 401;
      throw err;
    }

    const ok = await user.verifyPassword(String(password));
    if (!ok) {
      const err = new Error("Invalid credentials");
      err.statusCode = 401;
      throw err;
    }

    const token = signAccessToken({ sub: user._id.toString(), role: user.role });

    // reload without passwordHash selection
    const safeUser = await User.findById(user._id);
    setAccessTokenCookie(res, token);

    res.json({
      ok: true,
      token,
      user: safeUser.toSafeJSON()
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ ok: true, user: req.user.toSafeJSON() });
});

module.exports = router;

