const express = require("express");
const { Payment, recordedCashFilter } = require("../models/Payment");
const { Invoice } = require("../models/Invoice");
const { CommissionEntry } = require("../models/CommissionEntry");
const { ServiceRequest, REQUEST_CATEGORIES } = require("../models/ServiceRequest");
const { queryTimeout, chronology, queryValues, invalid, objectId, dateFilter, pageLimit, decodeCursor, pageCursor } = require("../services/adminHistory");
const {
  methods, statuses, classifications, paymentProjection, invoiceProjection, addOne, requestStages,
  classificationStages, recordFilter, peopleFor, person, paymentRow, invoiceRow, monthly
} = require("../services/adminFinance");

const router = express.Router();
const commonKeys = ["q", "customer", "provider", "category", "from", "to", "limit", "cursor"];
const paymentKeys = new Set([...commonKeys, "method", "status", "classification"]);
const invoiceKeys = new Set(commonKeys);
const earningsKeys = new Set(["from", "to", "limit", "cursor"]);
const definitions = { methods, statuses, classifications, categories: REQUEST_CATEGORIES };

function pageStages(cursor, limit) {
  return [...(cursor ? [{ $match: cursor }] : []), { $sort: chronology }, { $limit: limit + 1 }];
}

function bucketBy(field) {
  return [{ $group: { _id: "$" + field, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }];
}

function aggregate(model, pipeline) {
  return model.aggregate(pipeline).option({ maxTimeMS: queryTimeout, allowDiskUse: true });
}

function validateId(value) {
  const id = objectId(value);
  if (!id) throw invalid("Invalid record ID.");
  return id;
}

function missing(label) {
  return Object.assign(new Error(label + " not found."), { statusCode: 404 });
}

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

router.get("/payments", async (req, res, next) => {
  try {
    const input = queryValues(req.query, paymentKeys);
    const limit = pageLimit(input.limit);
    const cursor = decodeCursor(input.cursor);
    const filter = await recordFilter(input);
    const [report] = await aggregate(Payment, [
      { $match: filter }, { $project: paymentProjection },
      ...requestStages(input.category), ...classificationStages(),
      ...(input.classification ? [{ $match: { classification: input.classification } }] : []),
      { $facet: {
        page: [...pageStages(cursor, limit), { $unset: ["collectedByUserId", "stripeIntentId", "stripeEventCreated", "stripeEvidence"] }],
        classifications: [{ $group: {
          _id: { classification: "$classification", currency: "$currency" },
          count: { $sum: 1 }, amountMinor: { $sum: "$amountMinor" }
        } }, { $sort: { "_id.classification": 1, "_id.currency": 1 } }],
        methods: bucketBy("method"), statuses: bucketBy("status"),
        collections: [
          { $match: { classification: "cash_confirmed" } },
          { $group: { _id: { category: "$request.category", currency: "$currency" }, count: { $sum: 1 }, amountMinor: { $sum: "$amountMinor" } } },
          { $sort: { "_id.category": 1, "_id.currency": 1 } }
        ],
        monthly: monthly("paidAt", "amountMinor", { classification: "cash_confirmed" })
      } }
    ]);
    const { page, ...analytics } = report;
    const people = await peopleFor(page.slice(0, limit));
    res.json({ ok: true, definitions, analytics, next: pageCursor(page, limit), payments: page.slice(0, limit).map(row => paymentRow(row, people)) });
  } catch (error) { next(error); }
});

router.get("/payments/:id", async (req, res, next) => {
  try {
    queryValues(req.query, new Set());
    const [row] = await aggregate(Payment, [
      { $match: { _id: validateId(req.params.id) } }, { $project: paymentProjection },
      ...requestStages(), ...classificationStages(), ...addOne(Invoice, "invoiceId", "invoice", invoiceProjection)
    ]);
    if (!row) throw missing("Payment");
    const people = await peopleFor([row]);
    const linkMatches = row.invoice && ["requestId", "userId", "providerId"].every(key => String(row.invoice[key]) === String(row[key]));
    const invoice = linkMatches ? invoiceRow(row.invoice, people) : null;
    res.json({ ok: true, payment: paymentRow(row, people), invoice });
  } catch (error) { next(error); }
});

router.get("/invoices", async (req, res, next) => {
  try {
    const input = queryValues(req.query, invoiceKeys);
    const limit = pageLimit(input.limit);
    const cursor = decodeCursor(input.cursor);
    const filter = await recordFilter(input, true);
    const page = await aggregate(Invoice, [
      { $match: cursor ? { $and: [filter, cursor] } : filter },
      { $sort: chronology }, { $project: invoiceProjection },
      ...(input.category ? requestStages(input.category) : []), { $limit: limit + 1 },
      ...(!input.category ? requestStages() : [])
    ]);
    const people = await peopleFor(page.slice(0, limit));
    res.json({ ok: true, definitions, next: pageCursor(page, limit), invoices: page.slice(0, limit).map(row => invoiceRow(row, people)) });
  } catch (error) { next(error); }
});

router.get("/invoices/:id", async (req, res, next) => {
  try {
    queryValues(req.query, new Set());
    const [row] = await aggregate(Invoice, [
      { $match: { _id: validateId(req.params.id) } },
      { $project: { ...invoiceProjection, "lines.label": 1, "lines.amountMinor": 1 } },
      ...requestStages()
    ]);
    if (!row) throw missing("Invoice");
    const [payment] = await aggregate(Payment, [
      { $match: { invoiceId: row._id, requestId: row.requestId, userId: row.userId, providerId: row.providerId } },
      { $project: paymentProjection }, ...classificationStages()
    ]);
    const people = await peopleFor(payment ? [row, payment] : [row]);
    res.json({ ok: true, invoice: {
      ...invoiceRow(row, people), lines: (row.lines ?? []).map(({ label, amountMinor }) => ({ label, amountMinor })),
      serviceFeeMinor: row.serviceFeeMinor, providerEarningsMinor: row.providerEarningsMinor
    }, payment: payment ? paymentRow({ ...payment, request: row.request }, people) : null });
  } catch (error) { next(error); }
});

function dateRange(input, field) {
  const dates = dateFilter(input.from, input.to);
  return dates ? { [field]: dates.createdAt } : {};
}

router.get("/commission", async (req, res, next) => {
  try {
    const input = queryValues(req.query, earningsKeys);
    const limit = pageLimit(input.limit);
    const cursor = decodeCursor(input.cursor);
    const [report] = await aggregate(CommissionEntry, [
      { $match: dateRange(input, "earnedAt") },
      ...addOne(Payment, "_id", "payment", paymentProjection),
      ...addOne(Invoice, "invoiceId", "invoice", { ...invoiceProjection, stripePaidAt: 1, stripePaymentId: 1 }),
      { $set: { requestId: "$payment.requestId", createdAt: "$earnedAt", method: "$payment.method", status: "$payment.status",
        paidAt: "$payment.paidAt", stripeIntentId: "$payment.stripeIntentId", stripeEventCreated: "$payment.stripeEventCreated" } },
      ...classificationStages(), ...requestStages(),
      { $set: { reconciled: { $and: [
        { $eq: ["$classification", "stripe_test"] }, { $eq: ["$status", "paid"] },
        { $eq: ["$earnedAt", "$payment.paidAt"] },
        { $eq: ["$invoiceId", "$payment.invoiceId"] }, { $eq: ["$providerId", "$payment.providerId"] },
        { $eq: ["$currency", "$payment.currency"] }, { $eq: ["$grossMinor", "$payment.amountMinor"] },
        { $eq: ["$providerNetMinor", "$payment.providerNetMinor"] },
        { $eq: ["$_id", "$invoice.stripePaymentId"] }, { $eq: ["$earnedAt", "$invoice.stripePaidAt"] },
        { $eq: ["$commissionMinor", "$invoice.serviceFeeMinor"] }, { $eq: ["$grossMinor", "$invoice.totalMinor"] },
        { $eq: ["$currency", "$invoice.currency"] },
        { $eq: ["$grossMinor", { $add: ["$commissionMinor", "$providerNetMinor"] }] },
        { $gte: ["$commissionMinor", 0] }, { $gte: ["$providerNetMinor", 0] }
      ] } } },
      { $facet: {
        page: [...pageStages(cursor, limit), { $project: {
          createdAt: 1, earnedAt: 1, providerId: 1, requestId: 1, invoiceId: 1, currency: 1, grossMinor: 1,
          commissionMinor: 1, providerNetMinor: 1, reconciled: 1, "request.category": 1
        } }],
        totals: [{ $match: { reconciled: true } }, { $group: {
          _id: { category: "$request.category", currency: "$currency" },
          count: { $sum: 1 }, amountMinor: { $sum: "$commissionMinor" }, providerNetMinor: { $sum: "$providerNetMinor" }
        } }, { $sort: { "_id.category": 1, "_id.currency": 1 } }],
        unreconciled: [{ $match: { reconciled: { $ne: true } } }, { $count: "count" }],
        monthly: monthly("earnedAt", "commissionMinor", { reconciled: true })
      } }
    ]);
    const people = await peopleFor(report.page.slice(0, limit));
    res.json({
      ok: true, next: pageCursor(report.page, limit), totals: report.totals, monthly: report.monthly,
      unreconciled: report.unreconciled[0]?.count ?? 0,
      entries: report.page.slice(0, limit).map(row => ({
        id: String(row._id), requestId: row.requestId ?? null, invoiceId: row.invoiceId ?? null,
        provider: person(row.providerId, people), category: row.request?.category ?? null,
        currency: row.currency, earnedAt: row.earnedAt, grossMinor: row.grossMinor, commissionMinor: row.commissionMinor,
        providerNetMinor: row.providerNetMinor, reconciled: row.reconciled
      }))
    });
  } catch (error) { next(error); }
});

router.get("/earnings", async (req, res, next) => {
  try {
    const input = queryValues(req.query, earningsKeys);
    const limit = pageLimit(input.limit);
    const cursor = decodeCursor(input.cursor);
    const [report] = await aggregate(Payment, [
      { $match: { $and: [recordedCashFilter, dateRange(input, "paidAt")] } },
      { $project: paymentProjection }, ...requestStages(),
      { $match: { "request.status": "completed", $expr: { $and: [
        { $eq: ["$providerId", "$request.providerId"] }, { $eq: ["$userId", "$request.userId"] }
      ] } } },
      ...addOne(Invoice, "invoiceId", "invoice", invoiceProjection),
      { $set: {
        hasRecordedNet: { $isNumber: "$providerNetMinor" },
        hasLinkedInvoice: { $and: [
          { $eq: ["$requestId", "$invoice.requestId"] }, { $eq: ["$providerId", "$invoice.providerId"] },
          { $eq: ["$userId", "$invoice.userId"] }, { $eq: ["$amountMinor", "$invoice.totalMinor"] },
          { $eq: ["$currency", "$invoice.currency"] }, { $eq: ["$invoice.status", "finalized"] }
        ] }
      } },
      { $set: {
        recordedNet: { $cond: ["$hasRecordedNet", "$providerNetMinor", null] },
        estimatedNet: { $cond: [{ $and: ["$hasLinkedInvoice", { $not: ["$hasRecordedNet"] }] }, "$invoice.providerEarningsMinor", null] },
        fee: { $cond: ["$hasLinkedInvoice", "$invoice.serviceFeeMinor", null] }
      } },
      { $group: {
        _id: { providerId: "$providerId", currency: "$currency" }, createdAt: { $max: "$paidAt" },
        jobs: { $sum: 1 }, grossMinor: { $sum: "$amountMinor" },
        recordedMinor: { $sum: "$recordedNet" }, estimatedMinor: { $sum: "$estimatedNet" }, feeMinor: { $sum: "$fee" },
        recordedJobs: { $sum: { $cond: [{ $isNumber: "$recordedNet" }, 1, 0] } },
        estimatedJobs: { $sum: { $cond: [{ $isNumber: "$estimatedNet" }, 1, 0] } },
        feeJobs: { $sum: { $cond: [{ $isNumber: "$fee" }, 1, 0] } }
      } },
      { $facet: {
        page: [
          { $sort: { "_id.currency": 1 } },
          { $group: { _id: "$_id.providerId", createdAt: { $max: "$createdAt" }, amounts: { $push: "$$ROOT" } } },
          ...pageStages(cursor, limit)
        ],
        totals: [{ $group: {
          _id: "$_id.currency", jobs: { $sum: "$jobs" }, grossMinor: { $sum: "$grossMinor" },
          recordedMinor: { $sum: "$recordedMinor" }, estimatedMinor: { $sum: "$estimatedMinor" }, feeMinor: { $sum: "$feeMinor" },
          recordedJobs: { $sum: "$recordedJobs" }, estimatedJobs: { $sum: "$estimatedJobs" }, feeJobs: { $sum: "$feeJobs" }
        } }, { $sort: { _id: 1 } }]
      } }
    ]);
    const people = await peopleFor(report.page.slice(0, limit).map(row => ({ providerId: row._id })));
    const { page, totals } = report;
    res.json({
      ok: true, next: pageCursor(page, limit), totals,
      providers: page.slice(0, limit).map(row => ({
        provider: person(row._id, people), lastCollectionAt: row.createdAt,
        amounts: row.amounts.map(({ _id, createdAt, ...amount }) => ({ currency: _id.currency, ...amount }))
      }))
    });
  } catch (error) { next(error); }
});

module.exports = router;
