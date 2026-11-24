const { User } = require("../models/User");
const { checkLiveness, findDuplicateFace } = require("./faceVerification.service");

const PROVIDER_NAME = "face-api-local";

/**
 * Runs the free local face checks for a new provider.
 *
 * Returns:
 *   rejectMessage - set when the provider must retake selfies (liveness failed)
 *   faceChecks    - stored on mechanicProfile.faceChecks for the admin panel
 *   descriptor    - stored on user.faceDescriptor for future duplicate checks
 *
 * If the models themselves crash, sign-up is NOT blocked: the result is
 * saved with status "error" so the admin checks this provider manually.
 */
async function runProviderFaceChecks(mechanicProfile) {
  const checkedAt = new Date();

  let liveness;
  try {
    liveness = await checkLiveness(mechanicProfile);
  } catch (err) {
    console.error("Face check failed:", err);
    return {
      rejectMessage: null,
      descriptor: undefined,
      faceChecks: {
        status: "error",
        provider: PROVIDER_NAME,
        error: err?.message || "Face check failed",
        checkedAt
      }
    };
  }

  if (!liveness.passed) {
    return { rejectMessage: liveness.reason, faceChecks: null, descriptor: undefined };
  }

  const existingProviders = await User.find({
    role: "mechanic",
    "faceDescriptor.0": { $exists: true }
  }).select("+faceDescriptor name phone");

  const duplicate = findDuplicateFace(
    liveness.descriptor,
    existingProviders.map((provider) => ({
      id: provider._id.toString(),
      name: provider.name,
      phone: provider.phone,
      faceDescriptor: provider.faceDescriptor
    }))
  );

  return {
    rejectMessage: null,
    descriptor: liveness.descriptor,
    faceChecks: {
      status: duplicate.found ? "flagged" : "passed",
      provider: PROVIDER_NAME,
      liveness: { passed: true, reason: null, yaw: liveness.yaw },
      duplicate: duplicate.found
        ? {
            found: true,
            matchedUserId: duplicate.matchedUserId,
            matchedName: duplicate.matchedName,
            matchedPhone: duplicate.matchedPhone,
            distance: duplicate.distance
          }
        : { found: false, distance: duplicate.distance },
      error: null,
      checkedAt
    }
  };
}

module.exports = { runProviderFaceChecks };
