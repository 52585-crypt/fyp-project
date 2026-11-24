const { Payment, recordedCashFilter } = require("../models/Payment");
const { Invoice } = require("../models/Invoice");
const { User } = require("../models/User");
const { ServiceRequest, REQUEST_CATEGORIES } = require("../models/ServiceRequest");
const { StripeWebhookEvent } = require("../models/StripeWebhookEvent");
const { dateFilter, invalid, objectId, queryTimeout } = require("./adminHistory");

const methods = Payment.schema.path("method").enumValues;
const statuses = Payment.schema.path("status").enumValues;
const classifications = ["cash_confirmed", "cash_unverified", "cash_not_collected", "stripe_test", "stripe_unverified", "simulation"];
const stripeEventTypes = {
  paid: "payment_intent.succeeded", failed: "payment_intent.payment_failed",
  processing: "payment_intent.processing", canceled: "payment_intent.canceled"
};
const cashEvidence = {
  $and: Object.entries(recordedCashFilter).map(([field, value]) => typeof value === "object"
    ? { $eq: [{ $type: "$" + field }, value.$type] }
    : { $eq: ["$" + field, value] })
};

const paymentProjection = {
  requestId: 1, invoiceId: 1, userId: 1, providerId: 1, currency: 1, amountMinor: 1, method: 1, status: 1,
  createdAt: 1, updatedAt: 1, paidAt: 1, collectedByUserId: 1, providerNetMinor: 1, stripeIntentId: 1, stripeEventCreated: 1
};
const invoiceProjection = {
  requestId: 1, userId: 1, providerId: 1, invoiceNumber: 1, currency: 1, totalMinor: 1,
  status: 1, createdAt: 1, finalizedAt: 1, serviceFeeMinor: 1, providerEarningsMinor: 1
};

function addOne(model, field, name, project) {
  return [
    { $lookup: { from: model.collection.name, localField: field, foreignField: "_id", pipeline: [{ $project: project }], as: name } },
    { $set: { [name]: { $first: "$" + name } } }
  ];
}

function requestStages(category) {
  return [
    ...addOne(ServiceRequest, "requestId", "request", { category: 1, status: 1, userId: 1, providerId: 1 }),
    ...(category ? [{ $match: { "request.category": category } }] : [])
  ];
}

function classificationStages() {
  // A matching applied event is durable sandbox evidence. This webhook accepts only
  // test-mode events; legacy Stripe references and a paid flag alone prove neither mode nor capture.
  return [{
    $lookup: {
      from: StripeWebhookEvent.collection.name,
      localField: "stripeIntentId", foreignField: "intentId",
      let: { method: "$method", eventCreated: "$stripeEventCreated", status: "$status" },
      pipeline: [
        { $match: { outcome: "applied", $expr: { $and: [
          { $eq: ["$$method", "stripe"] },
          { $eq: ["$stripeCreated", "$$eventCreated"] },
          { $or: Object.entries(stripeEventTypes).map(([status, type]) => ({ $and: [
            { $eq: ["$$status", status] }, { $eq: ["$type", type] }
          ] })) }
        ] } } },
        { $limit: 1 }, { $project: { _id: 1 } }
      ],
      as: "stripeEvidence"
    }
  }, { $set: {
    classification: { $switch: { branches: [
      { case: cashEvidence, then: "cash_confirmed" },
      { case: { $and: [{ $eq: ["$method", "cash"] }, { $eq: ["$status", "paid"] }] }, then: "cash_unverified" },
      { case: { $eq: ["$method", "cash"] }, then: "cash_not_collected" },
      { case: { $eq: ["$method", "online_simulated"] }, then: "simulation" },
      { case: { $and: [
        { $eq: ["$method", "stripe"] },
        { $gt: [{ $size: "$stripeEvidence" }, 0] },
        { $or: [{ $ne: ["$status", "paid"] }, { $and: [
          { $eq: [{ $type: "$paidAt" }, "date"] },
          { $eq: [{ $convert: { input: "$paidAt", to: "long", onError: null } }, { $multiply: ["$stripeEventCreated", 1000] }] }
        ] }] }
      ] }, then: "stripe_test" },
      { case: { $eq: ["$method", "stripe"] }, then: "stripe_unverified" }
    ], default: "unknown" } }
  } }];
}

async function historyPayments(filter, page = {}) {
  const rows = await Payment.aggregate([
    { $match: filter },
    ...(page.sort ? [{ $sort: page.sort }] : []),
    ...(page.limit ? [{ $limit: page.limit }] : []),
    { $project: {
      requestId: 1, createdAt: 1, method: 1, status: 1, amountMinor: 1, currency: 1, paidAt: 1,
      collectedByUserId: 1, stripeIntentId: 1, stripeEventCreated: 1
    } },
    ...classificationStages(),
    { $project: {
      requestId: 1, createdAt: 1, method: 1, status: 1, amountMinor: 1, currency: 1, paidAt: 1, classification: 1
    } }
  ]).option({ maxTimeMS: queryTimeout });
  return rows.map(({ _id, requestId, createdAt, method, status, amountMinor, currency, paidAt, classification }) => ({
    _id, requestId, createdAt, payment: {
      method, status, amountMinor, currency, paidAt: paidAt ?? null, classification,
      cashCollectionRecorded: classification === "cash_confirmed"
    }
  }));
}

async function matchingNames(value) {
  const id = objectId(value);
  if (id) return [id];
  if (value.length < 2) throw invalid("Enter at least two characters to search by name.");
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = await User.find({ name: new RegExp("^" + escaped, "i") }, "_id").limit(201).maxTimeMS(queryTimeout).lean();
  if (matches.length > 200) throw invalid("Too many names match. Use a longer name or an exact ID.");
  return matches.map(({ _id }) => _id);
}

async function recordFilter(input, invoices = false) {
  if (input.category && !REQUEST_CATEGORIES.includes(input.category)) throw invalid("Invalid service category.");
  if (input.method && !methods.includes(input.method)) throw invalid("Invalid payment method.");
  if (input.status && !statuses.includes(input.status)) throw invalid("Invalid payment status.");
  if (input.classification && !classifications.includes(input.classification)) throw invalid("Invalid payment classification.");
  const criteria = [dateFilter(input.from, input.to)].filter(Boolean);
  if (input.method) criteria.push({ method: input.method });
  if (input.status) criteria.push({ status: input.status });
  const [search, customers, providers] = await Promise.all([input.q, input.customer, input.provider].map(value => value ? matchingNames(value) : null));
  if (search) {
    const id = objectId(input.q);
    criteria.push({ $or: [
      ...(id ? [{ _id: id }, { requestId: id }] : []),
      ...(invoices ? [{ invoiceNumber: input.q.toUpperCase() }] : []),
      { userId: { $in: search } }, { providerId: { $in: search } }
    ] });
  }
  if (customers) criteria.push({ userId: { $in: customers } });
  if (providers) criteria.push({ providerId: { $in: providers } });
  return criteria.length ? { $and: criteria } : {};
}

async function peopleFor(records) {
  const ids = [...new Set(records.flatMap(({ userId, providerId }) => [userId, providerId]).filter(Boolean).map(String))];
  const users = await User.find({ _id: { $in: ids } }, "name").maxTimeMS(queryTimeout).lean();
  return new Map(users.map(user => [String(user._id), user.name]));
}

function person(id, people) {
  return id ? { id: String(id), name: people.get(String(id)) ?? null } : null;
}

function paymentRow(row, people) {
  return {
    id: String(row._id), requestId: String(row.requestId), invoiceId: row.invoiceId ?? null,
    customer: person(row.userId, people), provider: person(row.providerId, people),
    category: row.request?.category ?? null, method: row.method, status: row.status,
    classification: row.classification, currency: row.currency, amountMinor: row.amountMinor,
    createdAt: row.createdAt, updatedAt: row.updatedAt, paidAt: row.paidAt ?? null
  };
}

function invoiceRow(row, people) {
  return {
    id: String(row._id), requestId: String(row.requestId), invoiceNumber: row.invoiceNumber,
    customer: person(row.userId, people), provider: person(row.providerId, people), category: row.request?.category ?? null,
    currency: row.currency, totalMinor: row.totalMinor, status: row.status, createdAt: row.createdAt, finalizedAt: row.finalizedAt
  };
}

function monthly(date, amount, match = {}) {
  return [
    { $match: { [date]: { $type: "date" }, ...match } },
    { $group: { _id: {
      month: { $dateToString: { format: "%Y-%m", date: "$" + date, timezone: "UTC" } }, currency: "$currency"
    }, amountMinor: { $sum: "$" + amount }, count: { $sum: 1 } } },
    { $sort: { "_id.currency": 1 } },
    { $group: { _id: "$_id.month", currencies: { $push: { currency: "$_id.currency", amountMinor: "$amountMinor", count: "$count" } } } },
    { $sort: { _id: -1 } }, { $limit: 24 }
  ];
}

module.exports = {
  methods, statuses, classifications, paymentProjection, invoiceProjection, addOne, requestStages,
  classificationStages, historyPayments, recordFilter, peopleFor, person, paymentRow, invoiceRow, monthly
};
