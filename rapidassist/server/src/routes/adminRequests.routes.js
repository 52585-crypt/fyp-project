const express = require("express");
const { ServiceRequest, REQUEST_CATEGORIES, REQUEST_STATUSES } = require("../models/ServiceRequest");
const { User } = require("../models/User");
const { historyPayments } = require("../services/adminFinance");
const { DispatchOffer } = require("../models/DispatchOffer");
const { serializeLocation } = require("../services/googleLocationPolicy");

const {
  queryTimeout, unavailable, chronology, invalid, objectId,
  queryValues, dateFilter, decodeCursor, pageLimit, pageCursor, summarize
} = require("../services/adminHistory");

const router = express.Router();
const maxNameMatches = 200;
const offerLimit = 50;
const active = { status: { $nin: ["completed", "cancelled"] }, $nor: [unavailable] };
const listFields = "category status createdAt estimate.total estimate.currency userId providerId dispatch.state";
const parameters = new Set(["q", "customer", "provider", "category", "status", "from", "to", "cursor", "limit"]);

function notFound() {
  return Object.assign(new Error("Service request not found."), { statusCode: 404 });
}

async function matchingPeople(value) {
  const id = objectId(value);
  if (id) return [id];
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const users = await User.find({ name: new RegExp("^" + escaped, "i") }, "_id")
    .limit(maxNameMatches + 1).maxTimeMS(queryTimeout).lean();
  if (users.length > maxNameMatches) throw invalid("Too many people match. Enter a longer name or an exact ID.");
  return users.map(user => user._id);
}

async function buildFilter({ q, category, status, from, to, customer, provider }) {
  const clauses = [];
  if (category) {
    if (!REQUEST_CATEGORIES.includes(category)) throw invalid("Invalid service category.");
    clauses.push({ category });
  }
  if (status) {
    if (status === "active") clauses.push(active);
    else if (status === "unavailable") clauses.push(unavailable);
    else if (REQUEST_STATUSES.includes(status)) clauses.push({ status });
    else throw invalid("Invalid request status.");
  }
  const dates = dateFilter(from, to);
  if (dates) clauses.push(dates);

  const [searchIds, customerIds, providerIds] = await Promise.all([
    q ? matchingPeople(q) : null, customer ? matchingPeople(customer) : null, provider ? matchingPeople(provider) : null
  ]);
  if (searchIds) {
    const id = objectId(q);
    clauses.push({ $or: [
      ...(id ? [{ _id: id }] : []),
      { userId: { $in: searchIds } }, { providerId: { $in: searchIds } }
    ] });
  }
  if (customerIds) clauses.push({ userId: { $in: customerIds } });
  if (providerIds) clauses.push({ providerId: { $in: providerIds } });
  return clauses.length ? { $and: clauses } : {};
}

async function peopleFor(requests) {
  const ids = new Set(requests.flatMap(({ userId, providerId }) => [userId, providerId]).filter(Boolean).map(String));
  const users = await User.find({ _id: { $in: [...ids] } }, "name").maxTimeMS(queryTimeout).lean();
  return new Map(users.map(user => [String(user._id), user.name]));
}

function person(id, people) {
  return id ? { id: String(id), name: people.get(String(id)) ?? null } : null;
}

function requestRow(request, people, payment) {
  return {
    id: String(request._id), category: request.category, status: request.status, createdAt: request.createdAt,
    dispatchUnavailable: request.status === unavailable.status && request.dispatch?.state === "unavailable",
    customer: person(request.userId, people), provider: person(request.providerId, people),
    estimate: request.estimate ?? null, payment: payment ?? null
  };
}

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

router.get("/", async (req, res, next) => {
  try {
    const input = queryValues(req.query, parameters);
    const limit = pageLimit(input.limit);
    const cursor = decodeCursor(input.cursor);
    const filter = await buildFilter(input);
    const pageFilter = cursor ? { $and: [filter, cursor] } : filter;
    const [page, summary] = await Promise.all([
      ServiceRequest.find(pageFilter, listFields).sort(chronology).limit(limit + 1).maxTimeMS(queryTimeout).lean(),
      summarize(filter)
    ]);
    const rows = page.slice(0, limit);
    const [people, payments] = await Promise.all([
      peopleFor(rows),
      historyPayments({ requestId: { $in: rows.map(request => request._id) } })
    ]);
    const paymentsByRequest = new Map(payments.map(payment => [String(payment.requestId), payment.payment]));
    res.json({
      ok: true, summary,
      statuses: REQUEST_STATUSES,
      categories: REQUEST_CATEGORIES,
      requests: rows.map(request => requestRow(request, people, paymentsByRequest.get(String(request._id)))),
      next: pageCursor(page, limit)
    });
  } catch (error) { next(error); }
});

function locationInfo(location) {
  const safe = serializeLocation(location);
  if (!safe) return null;
  return {
    addressText: safe.addressText ?? null, lat: safe.lat ?? null, lng: safe.lng ?? null,
    expired: Boolean(safe.googleContentExpired)
  };
}

router.get("/:id", async (req, res, next) => {
  try {
    if (!objectId(req.params.id)) throw invalid("Invalid request ID.");
    const request = await ServiceRequest.findById(req.params.id,
      listFields + " pickupLocation destinationLocation dispatch.enabled dispatch.radiusKm dispatch.offeredAt dispatch.expiresAt dispatch.deadline dispatch.attemptedProviderIds statusTimeline.status statusTimeline.at statusTimeline.note acceptedAt completedAt cancelledAt")
      .maxTimeMS(queryTimeout).lean();
    if (!request) throw notFound();
    const [people, [payment], offers] = await Promise.all([
      peopleFor([request]),
      historyPayments({ requestId: request._id }, { limit: 1 }),
      DispatchOffer.find({ requestId: request._id }, "offeredAt respondedAt outcome")
        .sort({ offeredAt: -1, _id: -1 }).limit(offerLimit + 1).maxTimeMS(queryTimeout).lean()
    ]);
    const timeline = (request.statusTimeline ?? []).map(({ status, at }) => ({ status, at }));
    const cancellationReason = request.status === "cancelled"
      ? request.statusTimeline?.findLast(event => event.status === "cancelled" && event.note)?.note ?? null : null;
    const dispatch = request.dispatch;
    res.json({ ok: true, request: {
      ...requestRow(request, people, payment?.payment),
      pickup: locationInfo(request.pickupLocation), destination: locationInfo(request.destinationLocation),
      dispatch: dispatch?.enabled ? {
        state: dispatch.state, radiusKm: dispatch.radiusKm,
        offeredAt: dispatch.offeredAt, expiresAt: dispatch.expiresAt, deadline: dispatch.deadline,
        attempts: dispatch.attemptedProviderIds?.length ?? null
      } : null,
      acceptedAt: request.acceptedAt, completedAt: request.completedAt, cancelledAt: request.cancelledAt,
      cancellationReason, timeline,
      offers: offers.slice(0, offerLimit).map(({ offeredAt, respondedAt, outcome }) => ({ offeredAt, respondedAt, outcome })),
      olderOffersOmitted: offers.length > offerLimit
    } });
  } catch (error) { next(error); }
});

module.exports = router;
