import { ProviderProfile, User } from "../models/index.js";
import {
  isValidCnicNumber,
  normalizeCnic,
  verifyProviderIdentity,
} from "../services/identityVerificationService.js";
import { comparePassword, hashPassword, signToken } from "../utils/auth.js";

function getErrorMessage(error) {
  return error?.message || error?.code || error?.cause?.message || error?.cause?.code || String(error);
}

function sanitizeUser(row) {
  return {
    id: row.id || row._id?.toString(),
    role: row.role,
    name: row.name,
    phone: row.phone,
    profilePicture: row.profilePicture,
  };
}

function sanitizeProviderProfile(profile) {
  if (!profile) {
    return null;
  }

  return {
    workshopPicture: profile.workshopPicture || null,
    mechanicCertificateImage: profile.mechanicCertificateImage || null,
    cnicFrontImage: profile.cnicFrontImage || null,
    cnicBackImage: profile.cnicBackImage || null,
    selfieImage: profile.selfieImage || null,
    cnic: profile.cnic || null,
    cnicVerificationStatus: profile.cnicVerificationStatus || "rejected",
    cnicVerificationReason: profile.cnicVerificationReason || null,
    cnicVerificationProvider: profile.cnicVerificationProvider || null,
    cnicVerifiedAt: profile.cnicVerifiedAt || null,
    cnicExtractedNumber: profile.cnicExtractedNumber || null,
    cnicFaceSimilarity:
      typeof profile.cnicFaceSimilarity === "number" ? profile.cnicFaceSimilarity : null,
    isPremium: profile.isPremium || false,
    serviceCodes: profile.serviceCodes || [],
    city: profile.city || "Lahore",
    currentLatitude: profile.currentLatitude ?? null,
    currentLongitude: profile.currentLongitude ?? null,
    isAvailable: profile.isAvailable ?? true,
  };
}

function buildAuthResponse(user, providerProfile = null) {
  const token = signToken({ id: user.id, role: user.role, phone: user.phone });

  return {
    token,
    user: {
      ...sanitizeUser(user),
      providerProfile: user.role === "provider" ? sanitizeProviderProfile(providerProfile) : null,
    },
  };
}

function optionalNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export async function register(req, res) {
  const {
    role,
    name,
    phone,
    password,
    profilePicture,
    workshopPicture,
    mechanicCertificateImage,
    cnicFrontImage,
    cnicBackImage,
    selfieImage,
    cnic,
    latitude,
    longitude,
    serviceCodes,
    city,
  } = req.body;

  if (!role || !name || !phone || !password) {
    return res.status(400).json({ message: "role, name, phone and password are required" });
  }

  if (!["user", "provider"].includes(role)) {
    return res.status(400).json({ message: "role must be user or provider" });
  }

  if (role === "provider" && !cnic?.trim()) {
    return res.status(400).json({ message: "CNIC number is required for providers" });
  }

  if (role === "provider" && !isValidCnicNumber(cnic)) {
    return res.status(400).json({ message: "CNIC number must contain exactly 13 digits" });
  }

  if (role === "provider" && !cnicFrontImage?.trim()) {
    return res.status(400).json({ message: "CNIC front image is required for providers" });
  }

  if (role === "provider" && !cnicBackImage?.trim()) {
    return res.status(400).json({ message: "CNIC back image is required for providers" });
  }

  if (role === "provider" && !selfieImage?.trim()) {
    return res.status(400).json({ message: "Live selfie image is required for providers" });
  }

  if (role === "provider" && !workshopPicture?.trim()) {
    return res.status(400).json({ message: "Workshop picture is required for providers" });
  }

  if (role === "provider" && (!Array.isArray(serviceCodes) || serviceCodes.length === 0)) {
    return res.status(400).json({ message: "At least one provider service must be selected" });
  }

  if (
    role === "provider" &&
    Array.isArray(serviceCodes) &&
    serviceCodes.includes("mechanic") &&
    !mechanicCertificateImage?.trim()
  ) {
    return res.status(400).json({ message: "Mechanic certificate image is required for mechanic providers" });
  }

  try {
    const existingUser = await User.exists({ phone });

    if (existingUser) {
      return res.status(409).json({ message: "Phone number already registered" });
    }

    let verification = null;

    if (role === "provider") {
      verification = await verifyProviderIdentity({
        name,
        cnic,
        cnicFrontImage,
        cnicBackImage,
        selfieImage,
      });

      if (!verification.ok) {
        return res.status(400).json({
          message: verification.reason || "Provider identity verification failed",
          verification: {
            provider: verification.provider || process.env.IDENTITY_VERIFICATION_PROVIDER || "local",
            extractedCnic: verification.extractedCnic || null,
            faceSimilarity:
              typeof verification.faceSimilarity === "number" ? verification.faceSimilarity : null,
            verificationRef: verification.verificationRef || null,
          },
        });
      }
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      role,
      name,
      phone,
      passwordHash,
      profilePicture: profilePicture || null,
    });

    try {
      if (role === "provider") {
        await ProviderProfile.create({
          user: user._id,
          workshopPicture: workshopPicture || null,
          mechanicCertificateImage: mechanicCertificateImage || null,
