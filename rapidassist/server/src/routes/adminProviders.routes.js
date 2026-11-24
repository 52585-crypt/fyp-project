const express = require("express");
const { User, MECHANIC_SERVICE_CATEGORIES, VERIFICATION_STATUSES } = require("../models/User");
const { ServiceRequest } = require("../models/ServiceRequest");
const { roleFilter } = require("../utils/accountRoles");
const {
  chronology, dateFilter, decodeCursor, invalid, maskPhone, objectId, pageCursor,
  pageLimit, photoUrl, queryTimeout, queryValues, searchFilter, summarize
} = require("../services/adminHistory");

const router = express.Router();
const parameters = new Set(["q", "category", "availability", "verification", "activity", "from", "to", "cursor", "limit"]);
const directoryFields = {
  name: 1, phone: 1, profilePictureUrl: 1, createdAt: 1, verificationStatus: 1,
  "mechanicProfile.serviceCategory": 1, "providerState.isOnline": 1
};
const detailFields = {
  ...directoryFields, email: 1, isCertified: 1, "providerState.activeRequestId": 1,
  "mechanicVerification.submissionId": 1, "mechanicVerification.reviewState": 1, "mechanicVerification.reviewedAt": 1,
  workshopPhotoOnFile: { $ne: [{ $ifNull: ["$mechanicProfile.workshopPhotoUrl", ""] }, ""] }
};

function providerInfo(provider) {
  return {
    id: String(provider._id), name: provider.name, maskedPhone: maskPhone(provider.phone),
    profilePictureUrl: photoUrl(provider.profilePictureUrl), createdAt: provider.createdAt ?? null,
    category: provider.mechanicProfile?.serviceCategory ?? null,
    isOnline: provider.providerState?.isOnline ?? null,
    verificationStatus: provider.verificationStatus ?? null
  };
}

function filters(input) {
  const criteria = [roleFilter("mechanic"), searchFilter(input.q), dateFilter(input.from, input.to), decodeCursor(input.cursor)].filter(Boolean);
  if (input.category) {
    if (!MECHANIC_SERVICE_CATEGORIES.includes(input.category)) throw invalid("Invalid provider service category.");
    criteria.push({ "mechanicProfile.serviceCategory": input.category });
  }
  if (input.availability) {
    if (!["online", "offline"].includes(input.availability)) throw invalid("Invalid availability filter.");
    criteria.push({ "providerState.isOnline": input.availability === "online" });
  }
  if (input.verification) {
    if (!VERIFICATION_STATUSES.includes(input.verification)) throw invalid("Invalid verification status.");
    criteria.push({ verificationStatus: input.verification });
  }
  if (input.activity && !["completed", "none"].includes(input.activity)) throw invalid("Invalid completed job filter.");
  return { $and: criteria };
}

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

router.get("/", async (req, res, next) => {
  try {
    const input = queryValues(req.query, parameters);
    const limit = pageLimit(input.limit);
    const page = await User.aggregate([
      { $match: filters(input) },
      { $sort: chronology },
      { $project: directoryFields },
      ...(input.activity ? [
        { $lookup: {
          from: ServiceRequest.collection.name, localField: "_id", foreignField: "providerId",
          pipeline: [{ $match: { status: "completed" } }, { $limit: 1 }, { $project: { _id: 1 } }],
          as: "completedMatch"
        } },
        { $match: { "completedMatch.0": { $exists: input.activity === "completed" } } }
      ] : []),
      { $limit: limit + 1 }
    ]).option({ maxTimeMS: queryTimeout });

    const rows = page.slice(0, limit);
    const counts = rows.length ? await ServiceRequest.aggregate([
      { $match: { providerId: { $in: rows.map(row => row._id) }, status: "completed" } },
      { $group: { _id: "$providerId", count: { $sum: 1 } } }
    ]).option({ maxTimeMS: queryTimeout }) : [];
    const completed = new Map(counts.map(row => [String(row._id), row.count]));
    res.json({
      ok: true, next: pageCursor(page, limit), categories: MECHANIC_SERVICE_CATEGORIES, verificationStatuses: VERIFICATION_STATUSES,
      providers: rows.map(row => ({ ...providerInfo(row), completedJobs: completed.get(String(row._id)) ?? 0 }))
    });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    queryValues(req.query, new Set());
    const id = objectId(req.params.id);
    if (!id) throw invalid("Invalid provider ID.");
    const [provider] = await User.aggregate([
      { $match: { _id: id, ...roleFilter("mechanic") } },
      { $project: detailFields }
    ]).option({ maxTimeMS: queryTimeout });
    if (!provider) throw Object.assign(new Error("Provider not found."), { statusCode: 404 });

    // Count all valid ratings for completed jobs; the recent feedback list is only a preview.
    const reviews = { providerId: id, status: "completed", "review.rating": { $in: [1, 2, 3, 4, 5] } };
    const [activity, grouped, feedback] = await Promise.all([
      summarize({ providerId: id }),
      ServiceRequest.aggregate([
        { $match: reviews }, { $group: { _id: "$review.rating", count: { $sum: 1 } } }
      ]).option({ maxTimeMS: queryTimeout }),
      ServiceRequest.find(reviews, "review.rating review.comment review.reviewedAt")
        .sort({ "review.reviewedAt": -1, _id: -1 }).limit(5).maxTimeMS(queryTimeout).lean()
    ]);
    const count = grouped.reduce((sum, row) => sum + row.count, 0);
    const points = grouped.reduce((sum, row) => sum + row._id * row.count, 0);
    const verification = provider.mechanicVerification;
    res.json({
      ok: true, activity,
      provider: {
        ...providerInfo(provider), email: provider.email ?? null, isCertified: provider.isCertified ?? null,
        hasActiveAssignment: Boolean(provider.providerState?.activeRequestId),
        workshopPhotoOnFile: provider.workshopPhotoOnFile
      },
      verification: {
        submissionId: verification?.submissionId ?? null,
        reviewState: verification?.reviewState ?? null,
        reviewedAt: verification?.reviewedAt ?? null
      },
      ratings: {
        count, average: count ? points / count : null,
        distribution: [5, 4, 3, 2, 1].map(stars => ({ stars, count: grouped.find(row => row._id === stars)?.count ?? 0 })),
        recent: feedback.map(({ _id, review }) => ({
          requestId: String(_id), rating: review.rating, comment: review.comment ?? null, reviewedAt: review.reviewedAt ?? null
        }))
      }
    });
  } catch (error) { next(error); }
});

module.exports = router;
