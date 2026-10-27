const express = require("express");
const { OAuth2Client } = require("google-auth-library");
const { User, MECHANIC_SERVICE_CATEGORIES } = require("../models/User");
const { signAccessToken } = require("../utils/jwt");
const { requireAuth } = require("../middleware/auth.middleware");
const { clearAccessTokenCookie, setAccessTokenCookie } = require("../utils/authCookie");

const router = express.Router();
const PUBLIC_USER_ROLES = ["user", "mechanic"];
const MECHANIC_IMAGE_MAX_CHARS = Number(process.env.MECHANIC_IMAGE_MAX_CHARS) || 2500000;
const googleClient = new OAuth2Client();

function googleClientIds() {
  return (process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function authError(message, statusCode = 401) {
  return Object.assign(new Error(message), { statusCode });
}

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

    if (!role || !PUBLIC_USER_ROLES.includes(role)) throw badRequest("Invalid role");
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
    if (!safeUser) throw Object.assign(new Error("Account no longer available"), { statusCode: 401 });
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

router.post("/google", async (req, res, next) => {
  try {
    const idToken = req.body?.idToken;
    if (typeof idToken !== "string" || !idToken.trim()) throw badRequest("Google ID token is required");

    const audiences = googleClientIds();
    if (!audiences.length) throw new Error("GOOGLE_CLIENT_IDS is missing");

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken, audience: audiences });
      payload = ticket.getPayload();
    } catch {
      throw authError("Invalid Google sign-in token");
    }

    const googleId = typeof payload?.sub === "string" ? payload.sub.trim() : "";
    const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!googleId || !email || payload.email_verified !== true) {
      throw authError("A verified Google email is required");
    }

    let user = await User.findOne({ googleId });
    if (user) {
      if (user.role !== "user") throw authError("Google sign-in is only available for customer accounts", 403);
    } else {
      const emailOwner = await User.findOne({ email });
      if (emailOwner) {
        throw authError("An account with this email already exists. Sign in using its existing method to link Google.", 409);
      }

      user = await User.create({
        role: "user",
        name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : email.split("@")[0],
        email,
        googleId,
        authProvider: "google",
        phone: null,
        passwordHash: null
      });
    }

    const token = signAccessToken({ sub: user._id.toString(), role: user.role });
    setAccessTokenCookie(res, token);
    res.json({ ok: true, token, user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

router.patch("/me/phone", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== "user" || req.user.authProvider !== "google" || req.user.phone) {
      throw authError("Phone completion is unavailable for this account", 403);
    }

    const phone = normalizeStr(req.body?.phone);
    if (phone.length < 10) throw badRequest("Phone is required");
    if (await User.exists({ phone })) throw authError("Phone already registered", 409);

    const user = await User.findOneAndUpdate(
      { _id: req.user._id, role: "user", authProvider: "google", phone: null },
      { $set: { phone } },
      { new: true, runValidators: true }
    );
    if (!user) throw authError("Phone is already set", 409);
    res.json({ ok: true, user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

router.post("/admin/login", async (req, res, next) => {
  try {
    const email = normalizeStr(req.body?.email).toLowerCase();
    const password = req.body?.password;
    if (!email || !password) throw badRequest("Email and password are required");

    const admin = await User.findOne({ email, role: "admin" }).select("+passwordHash");
    if (!admin || !(await admin.verifyPassword(String(password)))) {
      const err = new Error("Invalid admin credentials");
      err.statusCode = 401;
      throw err;
    }

    const token = signAccessToken({ sub: admin._id.toString(), role: admin.role });
    setAccessTokenCookie(res, token);
    const safeAdmin = await User.findById(admin._id);
    if (!safeAdmin) throw Object.assign(new Error("Account no longer available"), { statusCode: 401 });
    res.json({ ok: true, token, user: safeAdmin.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user.toSafeJSON() });
});

router.post("/logout", (req, res) => {
  clearAccessTokenCookie(res);
  res.json({ ok: true });
});

module.exports = router;
