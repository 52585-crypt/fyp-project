const express = require("express");
const { User, USER_ROLES, MECHANIC_SERVICE_CATEGORIES } = require("../models/User");
const { signAccessToken } = require("../utils/jwt");
const { requireAuth } = require("../middleware/auth.middleware");
const { clearAccessTokenCookie, setAccessTokenCookie } = require("../utils/authCookie");

const router = express.Router();
const MECHANIC_IMAGE_MAX_CHARS = Number(process.env.MECHANIC_IMAGE_MAX_CHARS) || 2500000;

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function normalizeStr(v) {
  return v == null ? "" : String(v).trim();
}

function normalizeOptionalStr(v) {
  const value = normalizeStr(v);
  return value || null;
}

function parseNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function normalizeImageData(v, message, options = {}) {
  const value = normalizeStr(v);
  if (!value) {
    if (options.optional) return null;
    throw badRequest(message);
  }

  if (!value.startsWith("data:image/")) {
    throw badRequest(`${message} must be image data`);
  }

  if (value.length > MECHANIC_IMAGE_MAX_CHARS) {
    throw badRequest(`${message} is too large`);
  }

  return value;
}

function validateMechanicProfile(input) {
  const serviceCategory = normalizeStr(input?.serviceCategory);
  if (!MECHANIC_SERVICE_CATEGORIES.includes(serviceCategory)) {
    throw badRequest("Invalid mechanic service category");
  }

  const selfieUrl = normalizeImageData(input?.selfieUrl, "Real-time selfie");
  const idCardFrontUrl = normalizeImageData(input?.idCardFrontUrl, "ID card front photo");
  const idCardBackUrl = normalizeImageData(input?.idCardBackUrl, "ID card back photo");
  const workshopPhotoUrl = normalizeImageData(input?.workshopPhotoUrl, "Workshop photo", {
    optional: serviceCategory !== "mechanic"
  });
  const certificatePhotoUrl = normalizeImageData(input?.certificateUrl, "Certificate photo", {
    optional: serviceCategory !== "mechanic"
  });
  const drivingLicenseUrl = normalizeImageData(input?.drivingLicenseUrl, "Driving licence photo", {
    optional: serviceCategory === "mechanic"
  });

  const lat = parseNum(input?.liveLocation?.lat);
  const lng = parseNum(input?.liveLocation?.lng);
  const liveLocation =
    lat != null && lng != null
      ? {
          lat,
          lng,
          addressText: normalizeOptionalStr(input?.liveLocation?.addressText),
          capturedAt: new Date()
        }
      : {
          lat: null,
          lng: null,
          addressText: null,
          capturedAt: null
        };

  return {
    serviceCategory,
    selfieUrl,
    idCardFrontUrl,
    idCardBackUrl,
    workshopPhotoUrl,
    certificateUrl: certificatePhotoUrl,
    drivingLicenseUrl,
    liveLocation,
    identityMatch: {
      status: "pending",
      score: null,
      provider: null,
      checkedAt: null
    }
  };
}

router.post("/register", async (req, res, next) => {
  try {
    const { role, name, phone, password, isCertified, certificateUrl, mechanicProfile } = req.body || {};

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
    const normalizedMechanicProfile =
      role === "mechanic"
        ? validateMechanicProfile({
            ...mechanicProfile,
            certificateUrl: mechanicProfile?.certificateUrl || certificateUrl
          })
        : null;

    const user = await User.create({
      role,
      name: String(name).trim(),
      phone: String(phone).trim(),
      passwordHash,
      isCertified: role === "mechanic" ? Boolean(isCertified) : false,
      certificateUrl: normalizedMechanicProfile?.certificateUrl || null,
      verificationStatus: role === "mechanic" ? "pending" : "unverified",
      mechanicProfile: normalizedMechanicProfile
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

router.post("/logout", (req, res) => {
  clearAccessTokenCookie(res);
  res.json({ ok: true });
});

module.exports = router;

