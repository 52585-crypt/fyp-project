const express = require("express");
const { User } = require("../models/User");
const { ServiceRequest, REQUEST_CATEGORIES } = require("../models/ServiceRequest");
const { historyPayments } = require("../services/adminFinance");
const { roleFilter } = require("../utils/accountRoles");
const {
  queryTimeout, maskPhone, searchFilter, photoUrl, chronology, invalid, objectId, queryValues, dateFilter,
  decodeCursor, pageLimit, pageCursor, summarize
} = require("../services/adminHistory");

const router = express.Router();
const fields = "name email phone createdAt";
const listParameters = new Set(["q", "from", "to", "activity", "category", "cursor", "limit"]);
const historyParameters = new Set(["cursor", "limit"]);

function customerInfo(customer) {
  return {
    id: String(customer._id), name: customer.name, email: customer.email ?? null,
    maskedPhone: maskPhone(customer.phone), createdAt: customer.createdAt ?? null
  };
}

async function customerById(value, projection = fields) {
  const id = objectId(value);
  if (!id) throw invalid("Invalid customer ID.");
  const customer = await User.findOne({ _id: id, ...roleFilter("user") }, projection).maxTimeMS(queryTimeout).lean();
  if (!customer) throw Object.assign(new Error("Customer not found."), { statusCode: 404 });
  return customer;
}

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

router.get("/", async (req, res, next) => {
  try {
    const input = queryValues(req.query, listParameters);
    const limit = pageLimit(input.limit);
    const criteria = [roleFilter("user"), searchFilter(input.q), dateFilter(input.from, input.to), decodeCursor(input.cursor)].filter(Boolean);
    if (input.activity && !["has_requests", "no_requests"].includes(input.activity)) throw invalid("Invalid customer activity filter.");
    if (input.category && !REQUEST_CATEGORIES.includes(input.category)) throw invalid("Invalid service category.");
    if (input.activity === "no_requests" && input.category) {
      return res.json({ ok: true, customers: [], next: null, categories: REQUEST_CATEGORIES });
    }

    const page = await User.aggregate([
      { $match: { $and: criteria } },
      { $sort: chronology },
      { $project: { name: 1, email: 1, phone: 1, createdAt: 1 } },
      ...(input.category || input.activity ? [
        { $lookup: {
          from: ServiceRequest.collection.name,
          localField: "_id", foreignField: "userId",
          pipeline: [
            ...(input.category ? [{ $match: { category: input.category } }] : []),
            { $limit: 1 }, { $project: { _id: 1 } }
          ],
          as: "matchingRequests"
        } },
        { $match: { "matchingRequests.0": { $exists: input.activity !== "no_requests" } } }
      ] : []),
      { $limit: limit + 1 }
    ]).option({ maxTimeMS: queryTimeout });
    const rows = page.slice(0, limit);
    const counts = await ServiceRequest.aggregate([
      { $match: { userId: { $in: rows.map(customer => customer._id) } } },
      { $group: { _id: "$userId", total: { $sum: 1 } } }
    ]).option({ maxTimeMS: queryTimeout });
    const totals = new Map(counts.map(row => [String(row._id), row.total]));
    res.json({
      ok: true, categories: REQUEST_CATEGORIES, next: pageCursor(page, limit),
      customers: rows.map(customer => ({ ...customerInfo(customer), totalRequests: totals.get(String(customer._id)) ?? 0 }))
    });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    queryValues(req.query, new Set());
    const customer = await customerById(req.params.id, fields + " profilePictureUrl");
    const [activity, feedback] = await Promise.all([
      summarize({ userId: customer._id }),
      ServiceRequest.find({ userId: customer._id, "review.byUserId": customer._id, "review.rating": { $gte: 1, $lte: 5 } },
        "review.rating review.comment review.reviewedAt").sort({ "review.reviewedAt": -1, _id: -1 }).limit(5).maxTimeMS(queryTimeout).lean()
    ]);
    res.json({ ok: true, customer: { ...customerInfo(customer), profilePictureUrl: photoUrl(customer.profilePictureUrl) },
      activity, feedback: feedback.map(({ _id, review }) => ({ requestId: String(_id), ...review })) });
  } catch (error) { next(error); }
});

router.get("/:id/payments", async (req, res, next) => {
  try {
    const input = queryValues(req.query, historyParameters);
    const limit = pageLimit(input.limit);
    const cursor = decodeCursor(input.cursor);
    const customer = await customerById(req.params.id, "_id");
    const criteria = cursor ? { $and: [{ userId: customer._id }, cursor] } : { userId: customer._id };
    const page = await historyPayments(criteria, { sort: chronology, limit: limit + 1 });
    res.json({
      ok: true, next: pageCursor(page, limit),
      payments: page.slice(0, limit).map(payment => ({
        id: String(payment._id), requestId: String(payment.requestId), createdAt: payment.createdAt, ...payment.payment
      }))
    });
  } catch (error) { next(error); }
});

module.exports = router;
