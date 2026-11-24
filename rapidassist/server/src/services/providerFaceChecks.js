const { User } = require("../models/User");
const { roleFilter } = require("../utils/accountRoles");
const { checkLiveness, findDuplicateFace, CONFIG } = require("./faceVerification.service");

const PROVIDER_NAME = "face-api-local";

// One server-side line per check so FACE_MAX_FRONT_YAW / FACE_MIN_TURN_YAW can be tuned from real selfies.
// Numbers only: no name, phone or image data is logged.
function logFaceCheck(outcome, details) {
  console.info(`[face-check] ${outcome}`, JSON.stringify({
    ...details,
    thresholds: { maxFrontYaw: CONFIG.maxFrontYaw, minTurnYaw: CONFIG.minTurnYaw, samePersonDistance: CONFIG.samePersonDistance, duplicateDistance: CONFIG.duplicateDistance }
  }));
}

/**
 * Free local face checks for a provider's verification selfies (straight, head turned left, head turned right).
 *
 * @param {{ front: string, left: string, right: string }} selfies JPEG data URIs
 * @param {{ excludeUserId?: string }} options the submitting provider is never compared with themselves
 * @returns {Promise<{ rejectMessage: string|null, faceChecks: object, descriptor: number[]|undefined }>}
 *   rejectMessage - set when the provider must retake the selfies (liveness failed)
 *   faceChecks    - stored on mechanicVerification.faceChecks (admin only)
 *   descriptor    - stored on user.faceDescriptor for future duplicate checks
 *
 * If the models themselves crash, verification is NOT blocked: status "error" asks the admin to check manually.
 */
async function runProviderFaceChecks(selfies, { excludeUserId } = {}) {
  const checkedAt = new Date();

  let liveness;
  try {
    liveness = await checkLiveness({ selfieUrl: selfies.front, selfieLeftUrl: selfies.left, selfieRightUrl: selfies.right });
  } catch (err) {
    console.error("Face check failed:", err?.message || err);
    logFaceCheck("error", { error: err?.message || "Face check failed" });
    return {
      rejectMessage: null,
      descriptor: undefined,
      faceChecks: { status: "error", provider: PROVIDER_NAME, error: err?.message || "Face check failed", checkedAt }
    };
  }

  if (!liveness.passed) {
    logFaceCheck("rejected", { reason: liveness.reason, yaw: liveness.yaw ?? null, distances: liveness.distances ?? null });
    return { rejectMessage: liveness.reason, faceChecks: null, descriptor: undefined };
  }

  const existingProviders = await User.find({
    ...roleFilter("mechanic"),
    ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
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

  logFaceCheck(duplicate.found ? "passed, possible duplicate" : "passed", {
    yaw: liveness.yaw, distances: liveness.distances, duplicateDistance: duplicate.distance
  });

  return {
    rejectMessage: null,
    descriptor: liveness.descriptor,
    faceChecks: {
      status: duplicate.found ? "flagged" : "passed",
      provider: PROVIDER_NAME,
      yaw: liveness.yaw,
      samePersonDistance: liveness.distances,
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
