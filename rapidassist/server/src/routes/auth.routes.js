const express = require("express");
const { readCoordinates } = require("../services/locationInput");
const { createHash, randomBytes } = require("node:crypto");
const { OAuth2Client } = require("google-auth-library");
const { User, MECHANIC_SERVICE_CATEGORIES } = require("../models/User");
const { signAccessToken } = require("../utils/jwt");
const { requireAuth, readSession } = require("../middleware/auth.middleware");
const { clearAccessTokenCookie, setAccessTokenCookie } = require("../utils/authCookie");
const { createAdminLoginRateLimit } = require("../middleware/adminLoginRateLimit.middleware");
const { PUBLIC_USER_ROLES, accountRoles } = require("../utils/accountRoles");

const { recordActivity } = require("../services/adminActivity");

const router = express.Router();
router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
const PROVIDER_ENROLLMENT_TTL_MS = 15 * 60 * 1000;
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

function authUnavailable(publicCode, publicMessage, statusCode = 503) {
  return Object.assign(authError(publicMessage, statusCode), { expose: true, publicCode, publicMessage });
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

async function verifyGoogleIdentity(idToken) {
  if (typeof idToken !== "string" || !idToken.trim()) throw badRequest("Google ID token is required");
  const audience = googleClientIds();
  if (!audience.length) {
    throw authUnavailable("GOOGLE_AUTH_NOT_CONFIGURED", "Google sign-in is not configured on this server. Use phone sign-in or contact support.");
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience });
    payload = ticket.getPayload();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Failed to retrieve verification certificates:")) {
      throw authUnavailable("GOOGLE_VERIFICATION_UNAVAILABLE", "Google sign-in cannot be verified right now. Try again shortly.");
    }
    throw authError("Invalid Google sign-in token. Continue with Google again.");
  }
  // Google's library verifies the signature, issuer and audience and applies a clock skew allowance.
  if (!Number.isFinite(payload?.exp) || payload.exp <= Date.now() / 1000) {
    throw authError("Google sign-in expired. Continue with Google again.");
  }
  const googleId = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!googleId || !email || payload.email_verified !== true) {
    throw authError("A verified Google email is required.");
  }
  const picture = typeof payload.picture === "string" ? URL.parse(payload.picture) : null;
  return {
    googleId,
    email,
    name: (typeof payload.name === "string" && payload.name.trim()) || email.split("@")[0],
    profilePictureUrl: picture?.protocol === "https:" && !picture.username && !picture.password
      ? picture.href : null
  };
}

function hasGoogleSignIn(user) {
  return user.authProvider === "google" || Boolean(user.googleLinkedAt);
}

async function findGoogleAccount(identity) {
  const user = await User.findOne({ googleId: identity.googleId });
  if (user) {
    if (user.role === "admin" || !hasGoogleSignIn(user)) {
      throw authError("Use the existing sign-in method for this account.", 403);
    }
    return user;
  }
  if (await User.exists({ email: identity.email })) {
    throw authError("An account with this email already exists. Use its existing sign-in method.", 409);
  }
  return null;
}

function createSessionToken(user, role) {
  try {
    return signAccessToken({ sub: user.id, role });
  } catch {
    throw authUnavailable("AUTH_SESSION_UNAVAILABLE", "Your sign-in session could not be created. Try again shortly.", 500);
  }
}

function sendSession(res, user, status = 200, role = user.role, token) {
  if (!PUBLIC_USER_ROLES.includes(role) || !accountRoles(user).includes(role)) {
    throw authError("Invalid credentials");
  }
  token ??= createSessionToken(user, role);
  setAccessTokenCookie(res, token);
  return res.status(status).json({ ok: true, token, user: user.toSafeJSON(role) });
}

function enrollmentDigest(ticket, googleId) {
  return createHash("sha256").update(ticket).update(":").update(googleId).digest("hex");
}

function newProviderEnrollment(userId, googleId) {
  const enrollmentTicket = `${userId}.${randomBytes(32).toString("hex")}`;
  return { enrollmentTicket, providerEnrollment: {
    digest: enrollmentDigest(enrollmentTicket, googleId),
    expiresAt: new Date(Date.now() + PROVIDER_ENROLLMENT_TTL_MS)
  } };
}

function sendProviderEnrollment(res, user, identity, enrollmentTicket) {
  res.set("Cache-Control", "no-store");
  return res.json({ ok: true, registrationRequired: true, enrollmentTicket, profile: {
    name: user.name, email: user.email, phone: user.phone,
    profilePictureUrl: user.profilePictureUrl || identity.profilePictureUrl
  } });
}

async function issueProviderEnrollment(res, user, identity) {
  const { enrollmentTicket, providerEnrollment } = newProviderEnrollment(user.id, identity.googleId);
  const updated = await User.findOneAndUpdate(
    { _id: user.id, role: "user", roles: { $ne: "mechanic" }, authProvider: user.authProvider, googleId: identity.googleId },
    { $set: { providerEnrollment } },
    { new: true }
  );
  if (!updated) throw authError("Account changed. Continue with Google again.", 409);
  return sendProviderEnrollment(res, updated, identity, enrollmentTicket);
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

  const workshopPhotoUrl = normalizeImageData(input?.workshopPhotoUrl, "Workshop photo", {
    optional: serviceCategory !== "mechanic"
  });
  const certificatePhotoUrl = normalizeImageData(input?.certificateUrl, "Certificate photo", {
    optional: serviceCategory !== "mechanic"
  });
  const drivingLicenseUrl = normalizeImageData(input?.drivingLicenseUrl, "Driving licence photo", {
    optional: serviceCategory === "mechanic"
  });

  const raw = input?.liveLocation;
  const point = raw?.lat == null && raw?.lng == null ? null : readCoordinates(raw.lat, raw.lng);
  if ((raw?.lat != null || raw?.lng != null) && !point) throw Object.assign(new Error("Live location must be valid coordinates"), { statusCode: 400 });
  const { lat, lng } = point || {};
  const liveLocation =
    point
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
    const { role, name, phone, password, googleIdToken, certificateUrl, mechanicProfile } = req.body || {};

    if (!role || !PUBLIC_USER_ROLES.includes(role)) throw badRequest("Invalid role");
    const googleRegistration = googleIdToken !== undefined;
    if (googleRegistration && (role !== "mechanic" || password !== undefined)) {
      throw badRequest("Google registration requires the provider role and no password.");
    }
    const identity = googleRegistration ? await verifyGoogleIdentity(googleIdToken) : null;
    const googleAccount = identity && await findGoogleAccount(identity);
    if (googleAccount) {
      throw authError(accountRoles(googleAccount).includes("mechanic")
        ? "This Google account is already registered as a provider. Sign in with Google."
        : "Continue with Google to add provider access to your customer account.", 409);
    }
    const displayName = normalizeStr(name ?? identity?.name);
    if (displayName.length < 2) throw badRequest("Name is required");
    if (typeof phone !== "string" || phone.trim().length < 10) throw badRequest("Phone is required");
    if (!identity && (typeof password !== "string" || password.length < 6)) {
      throw badRequest("Password must be at least 6 characters");
    }

    const existing = await User.findOne({ phone: String(phone).trim() });
    if (existing) {
      const err = new Error("Phone already registered");
      err.statusCode = 409;
      throw err;
    }

    const normalizedMechanicProfile =
      role === "mechanic"
        ? validateMechanicProfile({
            ...mechanicProfile,
            certificateUrl: mechanicProfile?.certificateUrl || certificateUrl
          })
        : null;

    const user = await User.create({
      role,
      name: displayName,
      phone: phone.trim(),
      ...(identity ? {
        googleId: identity.googleId,
        email: identity.email,
        profilePictureUrl: identity.profilePictureUrl,
        authProvider: "google"
      } : { passwordHash: await User.hashPassword(password) }),
      isCertified: false,
      certificateUrl: normalizedMechanicProfile?.certificateUrl || null,
      verificationStatus: role === "mechanic" ? "pending" : "unverified",
      mechanicProfile: normalizedMechanicProfile
    });

    sendSession(res, user, 201);
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.googleId) {
      return next(authError("This Google account is already registered. Sign in with Google.", 409));
    }
    next(err);
  }
});

router.post("/provider-enrollment", async (req, res, next) => {
  try {
    const { enrollmentTicket, phone, mechanicProfile } = req.body || {};
    const invalidTicket = () => authError("Provider enrollment expired or is invalid. Continue with Google again.");
    if (typeof enrollmentTicket !== "string" || !/^[a-f0-9]{24}\.[a-f0-9]{64}$/.test(enrollmentTicket)) {
      throw invalidTicket();
    }
    const user = await User.findOne({ _id: enrollmentTicket.split(".")[0], role: "user" })
      .select("+googleId +providerEnrollment");
    if (!user?.googleId || !hasGoogleSignIn(user) || !user.providerEnrollment || user.providerEnrollment.expiresAt <= new Date()
      || user.providerEnrollment.digest !== enrollmentDigest(enrollmentTicket, user.googleId)) {
      throw invalidTicket();
    }
    if (typeof phone !== "string" || phone.trim().length < 10) throw badRequest("Phone is required");
    if (user.phone && user.phone !== phone.trim()) throw badRequest("Use the mobile number already on your customer account.");
    const profile = validateMechanicProfile(mechanicProfile);
    const provider = await User.findOneAndUpdate(
      {
        _id: user.id, role: "user", roles: { $ne: "mechanic" }, authProvider: user.authProvider, googleId: user.googleId,
        phone: user.phone ?? null, "mechanicProfile.serviceCategory": null, mechanicVerification: null,
        "providerEnrollment.digest": user.providerEnrollment.digest,
        "providerEnrollment.expiresAt": { $gt: new Date() }
      },
      {
        $addToSet: { roles: { $each: ["user", "mechanic"] } },
        $set: {
          phone: phone.trim(), mechanicProfile: profile, certificateUrl: profile.certificateUrl,
          verificationStatus: "pending", isCertified: false, "providerState.isOnline": false
        },
        $unset: { providerEnrollment: "" }
      },
      { new: true, runValidators: true }
    );
    if (!provider) throw authError("Account changed or provider enrollment already completed. Continue with Google again.", 409);
    res.set("Cache-Control", "no-store");
    sendSession(res, provider, 201, "mechanic");
  } catch (err) {
    next(err);
  }
});

router.post("/login", createAdminLoginRateLimit({
  limit: 30, message: "Too many sign-in attempts. Please wait and try again."
}), async (req, res, next) => {
  try {
    const { phone, password } = req.body || {};
    if (!phone || !password) throw badRequest("Phone and password are required");

    const user = await User.findOne({
      phone: String(phone).trim(), role: { $in: PUBLIC_USER_ROLES }
    }).select("+passwordHash");
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

    sendSession(res, user);
  } catch (err) {
    next(err);
  }
});

router.post("/google", async (req, res, next) => {
  try {
    const { idToken, intent = "customer" } = req.body || {};
    if (!["customer", "mechanic_register", "mechanic_login"].includes(intent)) {
      throw badRequest("Invalid Google sign-in intent");
    }
    const identity = await verifyGoogleIdentity(idToken);
    const role = intent === "customer" ? "user" : "mechanic";
    const user = await findGoogleAccount(identity);
    if (user) {
      const roles = accountRoles(user);
      if (roles.includes(role)) return sendSession(res, user, 200, role);
      if (intent === "mechanic_register" && roles.includes("user")) return await issueProviderEnrollment(res, user, identity);
      throw authError(intent === "mechanic_login"
        ? "This account is registered as a customer. Choose Register as a Provider to add provider access."
        : "This Google account belongs to a provider. Choose Provider on the login screen.", 409);
    }
    if (intent === "mechanic_login") {
      throw authError("No provider account is registered with this Google account. Choose Register as a Provider.", 404);
    }
    const { name, email, profilePictureUrl, googleId } = identity;
    if (intent === "mechanic_register") {
      return res.json({ ok: true, registrationRequired: true, profile: { name, email, profilePictureUrl } });
    }
    const newUser = new User({ role, name, email, googleId, authProvider: "google", profilePictureUrl });
    const token = createSessionToken(newUser, role);
    await newUser.save();
    sendSession(res, newUser, 200, role, token);
  } catch (err) {
    next(err);
  }
});

router.post("/me/google-link", requireAuth, createAdminLoginRateLimit({
  keyFor: (req) => req.user.id,
  message: "Too many Google linking attempts. Please wait and try again."
}), async (req, res, next) => {
  try {
    const { idToken, password } = req.body || {};
    if (req.authRole !== "user" || req.user.authProvider !== "local" || req.user.googleLinkedAt) {
      throw authError("Google linking is unavailable for this account.", 403);
    }
    const user = await User.findById(req.user.id).select("+passwordHash");
    if (typeof password !== "string" || !user || !(await user.verifyPassword(password))) {
      throw authError("Your current password is incorrect.");
    }
    const identity = await verifyGoogleIdentity(idToken);
    if (user.email && user.email !== identity.email) throw authError("Choose Google with the email on your customer account.", 409);
    if (await User.exists({ _id: { $ne: user.id }, $or: [{ email: identity.email }, { googleId: identity.googleId }] })) {
      throw authError("This Google account is already associated with a different RapidAssist account.", 409);
    }
    const { enrollmentTicket, providerEnrollment } = newProviderEnrollment(user.id, identity.googleId);
    const linked = await User.findOneAndUpdate(
      { _id: user.id, role: "user", authProvider: "local", googleLinkedAt: null,
        googleId: null, email: user.email ?? null, passwordHash: user.passwordHash },
      { $set: {
        googleId: identity.googleId, googleLinkedAt: new Date(),
        email: user.email || identity.email,
        profilePictureUrl: user.profilePictureUrl || identity.profilePictureUrl,
        providerEnrollment
      } },
      { new: true, runValidators: true }
    );
    if (!linked) throw authError("Account changed. Refresh your session before linking Google.", 409);
    return sendProviderEnrollment(res, linked, identity, enrollmentTicket);
  } catch (err) {
    next(err);
  }
});

router.patch("/me/phone", requireAuth, async (req, res, next) => {
  try {
    if (req.authRole !== "user" || req.user.authProvider !== "google" || req.user.phone) {
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
    res.json({ ok: true, user: user.toSafeJSON(req.authRole) });
  } catch (err) {
    next(err);
  }
});

router.post("/admin/login", createAdminLoginRateLimit(), async (req, res, next) => {
  try {
    const email = normalizeStr(req.body?.email).toLowerCase();
    const password = req.body?.password;
    if (!email || !password) throw badRequest("Email and password are required");

    const admin = await User.findOne({ email, role: "admin" }).select("+passwordHash");
    if (!admin || !(await admin.verifyPassword(String(password)))) {
      await recordActivity(req, res, { action: "admin.login" }, "failed", 401);
      throw authError("Invalid admin credentials");
    }

    const token = signAccessToken({ sub: admin._id.toString(), role: admin.role });
    const safeAdmin = await User.findById(admin._id);
    if (safeAdmin?.role !== "admin") throw authError("Account no longer available");
    await recordActivity(req, res, { action: "admin.login", adminId: safeAdmin._id }, "success", 200);
    setAccessTokenCookie(res, token);
    res.json({ ok: true, token, user: safeAdmin.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user.toSafeJSON(req.authRole) });
});

router.patch("/me/active-role", requireAuth, (req, res, next) => {
  try {
    const { activeRole } = req.body || {};
    if (!PUBLIC_USER_ROLES.includes(activeRole)) throw badRequest("Invalid account mode.");
    if (!accountRoles(req.user).includes(activeRole)) throw authError("This account does not have access to that mode.", 403);
    res.set("Cache-Control", "no-store");
    sendSession(res, req.user, 200, activeRole);
  } catch (err) {
    next(err);
  }
});

router.post("/logout", async (req, res) => {
  clearAccessTokenCookie(res);
  let session;
  try {
    session = await readSession(req, { adminOnly: true });
  } catch (error) {
    if (!["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(error.name)) {
      res.set("X-Admin-Audit-Status", "unavailable");
      console.error("Unable to resolve session to audit sign-out");
    }
  }
  if (session) await recordActivity(req, res, { action: "admin.logout", adminId: session.user._id }, "success", 200);
  res.json({ ok: true });
});

module.exports = router;
