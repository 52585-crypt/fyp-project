const { Types, isObjectIdOrHexString } = require("mongoose");
const { ServiceRequest } = require("../models/ServiceRequest");

const queryTimeout = 5000;
const unavailable = { status: "searching_provider", "dispatch.state": "unavailable" };
const chronology = { createdAt: -1, _id: -1 };

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function objectId(value) {
  return isObjectIdOrHexString(value) ? new Types.ObjectId(value) : null;
}

function maskPhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length > 4 ? "•••• " + digits.slice(-4) : "••••";
}

function searchFilter(q) {
  if (!q) return null;
  const id = objectId(q);
  if (id) return { _id: id };
  if (q.includes("@")) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q)) throw invalid("Enter a full email address.");
    return { email: q.toLowerCase() };
  }
  if (/^\+?[\d ()-]+$/.test(q)) return { phone: q };
  if (q.length < 2) throw invalid("Enter at least two characters to search by name.");
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { name: new RegExp("^" + escaped, "i") };
}

function photoUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password && !url.port && url.hostname.endsWith(".googleusercontent.com")) {
      return url.href;
    }
  } catch { /* An invalid stored image falls back to initials. */ }
  return null;
}

function queryValues(query, parameters) {
  for (const [key, value] of Object.entries(query)) {
    if (!parameters.has(key) || typeof value !== "string" || value.length > (key === "cursor" ? 120 : 80)) {
      throw invalid("Invalid filter.");
    }
  }
  return Object.fromEntries(Object.entries(query).map(([key, value]) => [key, value.trim()]));
}

function day(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid("Use YYYY-MM-DD for dates.");
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) {
    throw invalid("Use a valid calendar date.");
  }
  return date;
}

function decodeCursor(cursor) {
  if (cursor === undefined) return null;
  const [timestamp, id, extra] = cursor.split("_");
  const key = objectId(id);
  if (!key || extra !== undefined) throw invalid("Invalid cursor.");
  if (timestamp === "missing") return { createdAt: null, _id: { $lt: key } };
  const date = new Date(timestamp);
  if (!Number.isFinite(+date) || timestamp !== date.toISOString()) {
    throw invalid("Invalid cursor.");
  }
  return { $or: [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: key } }, { createdAt: null }] };
}

async function summarize(query) {
  const [summary] = await ServiceRequest.aggregate([
    { $match: query },
    { $group: {
      _id: null,
      total: { $sum: 1 },
      completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
      cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
      unavailable: { $sum: { $cond: [{ $and: [
        { $eq: ["$status", unavailable.status] }, { $eq: ["$dispatch.state", unavailable["dispatch.state"]] }
      ] }, 1, 0] } }
    } }
  ]).option({ maxTimeMS: queryTimeout });
  const { total = 0, completed = 0, cancelled = 0, unavailable: exhausted = 0 } = summary ?? {};
  return { total, active: total - completed - cancelled - exhausted, completed, cancelled, unavailable: exhausted };
}

function dateFilter(from, to) {
  const start = day(from);
  const end = day(to);
  if (start && end && start > end) throw invalid("The start date must be on or before the end date.");
  if (start || end) {
    return { createdAt: {
      ...(start ? { $gte: start } : {}),
      ...(end ? { $lt: new Date(+end + 86400000) } : {})
    } };
  }
  return null;
}

function pageLimit(value) {
  const limit = value === undefined ? 25 : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (value !== undefined && !/^\d+$/.test(value))) {
    throw invalid("Limit must be between 1 and 50.");
  }
  return limit;
}

function pageCursor(page, limit) {
  if (page.length <= limit) return null;
  const last = page[limit - 1];
  return `${last.createdAt?.toISOString() ?? "missing"}_${last._id}`;
}

module.exports = {
  queryTimeout, unavailable, chronology, invalid, objectId, maskPhone, searchFilter, photoUrl,
  queryValues, dateFilter, decodeCursor, pageLimit, pageCursor, summarize
};
