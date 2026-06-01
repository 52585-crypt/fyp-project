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
