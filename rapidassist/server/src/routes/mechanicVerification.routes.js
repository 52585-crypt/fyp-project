const express = require("express");
const { randomUUID } = require("node:crypto");
const { pipeline } = require("node:stream/promises");
const { User } = require("../models/User");
const { roleFilter } = require("../utils/accountRoles");
const { requireAdmin, requireRole } = require("../middleware/auth.middleware");
const { auditedChange, recordRejectedAction } = require("../services/adminActivity");
const { isObjectIdOrHexString } = require("mongoose");
const { CONSENT_VERSION, verificationError } = require("../services/mechanicVerification");

const decisions = new Map([["pending", "resubmit"], ["verified", "approve"], ["rejected", "reject"]]);
const IMAGE_KINDS = ["profile", "profileLeft", "profileRight", "cnic"];

/** Admin-only view of the local face checks (may name another provider for a possible duplicate). */
function faceChecksForAdmin(verification) {
  const checks = verification?.faceChecks;
  if (!checks) return null;
  const plain = typeof checks.toObject === "function" ? checks.toObject() : checks;
  return {
    ...plain,
    duplicate: plain.duplicate
      ? { ...plain.duplicate, matchedUserId: plain.duplicate.matchedUserId ? String(plain.duplicate.matchedUserId) : null }
      : null
  };
}

function summary(user, { includeScore = false } = {}) {
  const verification = user.mechanicVerification;
  const identityMatch = user.mechanicProfile?.identityMatch;
  return {
    verificationStatus: user.verificationStatus,
    submissionId: verification?.submissionId ?? null,
    reviewState: verification?.reviewState ?? null,
    reviewNote: verification?.reviewNote ?? null,
    reviewedAt: verification?.reviewedAt ?? null,
    identityMatch: identityMatch ? {
      status: identityMatch.status,
      provider: identityMatch.provider,
      checkedAt: identityMatch.checkedAt,
      ...(includeScore ? { score: identityMatch.score } : {})
    } : null
  };
}

function currentState(user) {
  return {
    _id: user._id,
    ...roleFilter("mechanic"),
    verificationStatus: user.verificationStatus,
    "mechanicVerification.submissionId": user.mechanicVerification?.submissionId ?? null,
    "mechanicVerification.reviewState": user.mechanicVerification?.reviewState ?? null
  };
}

async function findMechanic(id) {
  if (!isObjectIdOrHexString(id)) throw verificationError(400, "Invalid provider ID.");
  const mechanic = await User.findOne({ _id: id, ...roleFilter("mechanic") }).select("+mechanicVerification");
  if (!mechanic) throw verificationError(404, "Mechanic not found.");
  return mechanic;
}

function noStore(req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

async function cleanRetiredImages(service, user) {
  const retired = user.mechanicVerification.retiredImages || [];
  if (!retired.length) return;
  try {
    const failed = await service.deleteImages(retired);
    const removed = retired.filter(image => !failed.includes(image)).map(image => image.key);
    if (removed.length) {
      await User.updateOne({ _id: user._id }, {
        $pull: { "mechanicVerification.retiredImages": { key: { $in: removed } } }
      });
    }
  } catch {
    console.error("Could not record retired mechanic verification image cleanup", { mechanicId: user.id });
  }
}

function createMechanicVerificationRouter(service) {
  const router = express.Router();
  router.use(noStore, ...requireRole("mechanic"));

  router.get("/", async (req, res, next) => {
    try {
      res.json({ ok: true, verification: summary(await findMechanic(req.user._id)) });
    } catch (error) { next(error); }
  });

  router.post("/", async (req, res, next) => {
    try {
      const mechanic = await findMechanic(req.user._id);
      const previous = mechanic.mechanicVerification;
      if (mechanic.verificationStatus === "verified" || previous?.reviewState === "awaiting_review"
        || previous?.reviewState === "rejected") {
        throw verificationError(409, "An admin must request resubmission before you can submit another verification.");
      }
      const submissionId = randomUUID();
      const grantedAt = new Date();
      const { profilePhoto, profilePhotoLeft, profilePhotoRight, cnicFront, cnicPortraitRegion, biometricConsent } = req.body || {};
      const result = await service.submit({
        submissionId, mechanicId: mechanic._id, profilePhoto, profilePhotoLeft, profilePhotoRight,
        cnicFront, cnicPortraitRegion, biometricConsent
      });
      const retiredImages = [
        ...(previous?.retiredImages || []), ...IMAGE_KINDS.map((kind) => previous?.images?.[kind])
      ].filter(Boolean);

      let updated;
      try {
        updated = await User.findOneAndUpdate(currentState(mechanic), {
          // A face template is kept only from a submission whose local face check ran.
          ...(result.faceDescriptor ? {} : { $unset: { faceDescriptor: 1 } }),
          $set: {
          ...(result.faceDescriptor ? { faceDescriptor: result.faceDescriptor } : {}),
          verificationStatus: "pending",
          isCertified: false,
          "providerState.isOnline": false,
          "mechanicProfile.selfieUrl": null,
          "mechanicProfile.idCardFrontUrl": null,
          "mechanicProfile.idCardBackUrl": null,
          "mechanicProfile.identityMatch": {
            status: result.matchStatus, score: result.score, provider: "aws-rekognition", checkedAt: new Date()
          },
          mechanicVerification: {
            submissionId, reviewState: "awaiting_review", images: result.images, retiredImages,
            cnicPortraitRegion: result.comparedRegion,
            faceChecks: result.faceChecks || undefined,
            consent: { version: CONSENT_VERSION, grantedAt }
          }
        } }, { new: true, runValidators: true }).select("+mechanicVerification");
      } catch (error) {
        if (error.name === "ValidationError") {
          await service.deleteImages(Object.values(result.images));
        } else {
          // An interrupted write may have committed. Preserve evidence if its ownership is uncertain.
          const current = await findMechanic(mechanic._id).catch(() => null);
          if (current?.mechanicVerification?.submissionId === submissionId) updated = current;
          else console.error("Unconfirmed mechanic verification write", { submissionId });
        }
        if (!updated) throw error;
      }
      if (!updated) {
        await service.deleteImages(Object.values(result.images));
        throw verificationError(409, "Verification state changed. Refresh and try again.");
      }
      await cleanRetiredImages(service, updated);
      res.status(201).json({ ok: true, verification: summary(updated) });
    } catch (error) { next(error); }
  });

  return router;
}

function createAdminMechanicVerificationRouter(service) {
  const router = express.Router({ mergeParams: true });
  router.use(noStore, ...requireAdmin);

  router.get("/", async (req, res, next) => {
    try {
      const mechanic = await findMechanic(req.params.id);
      const verification = mechanic.mechanicVerification;
      res.json({ ok: true, verification: {
        ...summary(mechanic, { includeScore: true }),
        cnicPortraitRegion: verification?.cnicPortraitRegion ?? null,
        faceChecks: faceChecksForAdmin(verification),
        // Names only: each image is fetched separately through /images/:kind (detail view only).
        images: IMAGE_KINDS.filter((kind) => verification?.images?.[kind]?.key)
      } });
    } catch (error) { next(error); }
  });

  router.get("/images/:kind", async (req, res, next) => {
    try {
      const mechanic = await findMechanic(req.params.id);
      const verification = mechanic.mechanicVerification;
      const kind = req.params.kind;
      const image = IMAGE_KINDS.includes(kind) && verification?.images?.[kind];
      if (!image || req.query.submissionId !== verification.submissionId) {
        throw verificationError(404, "Verification image not found.");
      }
      const object = await service.getImage(image);
      res.set({ "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff" });
      await pipeline(object.Body, res);
    } catch (error) { next(error); }
  });

  router.patch("/", async (req, res, next) => {
    const { status, submissionId, note } = req.body || {};
    const decision = decisions.get(status);
    const event = decision ? { action: "verification." + decision, resourceId: req.params.id } : null;
    try {
      if (!event) {
        throw verificationError(400, "status must be pending, verified, or rejected.");
      }
      if (note !== undefined && (typeof note !== "string" || note.length > 500)) {
        throw verificationError(400, "Review note must be at most 500 characters.");
      }
      const reviewNote = note?.trim() || null;
      if (status === "rejected" && !reviewNote) throw verificationError(400, "Rejection reason is required.");
      if (status === "pending" && !reviewNote) throw verificationError(400, "Resubmission instructions are required.");
      const mechanic = await findMechanic(req.params.id);
      const verification = mechanic.mechanicVerification;
      if (verification?.submissionId && verification.submissionId !== submissionId) {
        throw verificationError(409, "Use the current verification submission ID.");
      }
      if (status !== "pending" && verification?.reviewState !== "awaiting_review") {
        throw verificationError(409, "A mechanic submission is required before approval or rejection.");
      }
      const reviewState = { pending: "resubmission_requested", verified: "approved", rejected: "rejected" }[status];
      const filter = currentState(mechanic);
      if (status !== "verified") filter["providerState.activeRequestId"] = null;
      const fields = {
        verificationStatus: status,
        isCertified: status === "verified",
        "mechanicVerification.reviewState": reviewState,
        "mechanicVerification.reviewedAt": new Date(),
        "mechanicVerification.reviewedBy": req.user._id,
        "mechanicVerification.reviewNote": reviewNote
      };
      if (status !== "verified") fields["providerState.isOnline"] = false;

      const updated = await auditedChange(req, res, event, session =>
        User.findOneAndUpdate(filter, { $set: fields }, { new: true, runValidators: true, session })
          .select("+mechanicVerification"));
      if (!updated) throw verificationError(409, "Mechanic has an active request or verification state changed.");
      await cleanRetiredImages(service, updated);
      res.json({
        ok: true,
        provider: { id: updated.id, verificationStatus: updated.verificationStatus, isCertified: updated.isCertified },
        verification: summary(updated, { includeScore: true })
      });
    } catch (error) {
      await recordRejectedAction(req, res, event, error);
      next(error);
    }
  });

  return router;
}

module.exports = { createMechanicVerificationRouter, createAdminMechanicVerificationRouter };
