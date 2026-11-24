const express = require("express");
const { AdminActivityLog, actions, resources, results } = require("../models/AdminActivityLog");
const { User } = require("../models/User");
const { chronology, dateFilter, decodeCursor, invalid, objectId, pageCursor, pageLimit, queryTimeout, queryValues } = require("../services/adminHistory");

const router = express.Router();
const parameters = new Set(["q", "admin", "action", "resource", "result", "from", "to", "cursor", "limit"]);
const definitions = {
  actions: Object.entries(actions).map(([key, value]) => ({ key, label: value.label })),
  resources, results
};

async function matchingAdmins(value) {
  const id = objectId(value);
  if (id) return [id];
  if (value.length < 2) throw invalid("Enter at least two characters to search by name.");
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = await User.find({ role: "admin", name: new RegExp("^" + escaped, "i") }, "_id")
    .limit(101).maxTimeMS(queryTimeout).lean();
  if (matches.length > 100) throw invalid("Too many administrators match. Enter a longer name or an exact ID.");
  return matches.map(row => row._id);
}

async function buildQuery(input) {
  const clauses = [dateFilter(input.from, input.to), decodeCursor(input.cursor)].filter(Boolean);
  if (input.action) {
    if (!Object.hasOwn(actions, input.action)) throw invalid("Invalid activity action.");
    clauses.push({ action: input.action });
  }
  if (input.resource) {
    if (!resources.includes(input.resource)) throw invalid("Invalid activity resource.");
    clauses.push({ resourceType: input.resource });
  }
  if (input.result) {
    if (!results.includes(input.result)) throw invalid("Invalid activity result.");
    clauses.push({ result: input.result });
  }
  if (input.admin) clauses.push({ adminId: { $in: await matchingAdmins(input.admin) } });
  if (input.q) {
    const id = objectId(input.q);
    if (id) clauses.push({ $or: [{ _id: id }, { adminId: id }, { resourceId: id }] });
    else if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.q)) clauses.push({ requestId: input.q.toLowerCase() });
    else clauses.push({ adminId: { $in: await matchingAdmins(input.q) } });
  }
  return clauses.length ? { $and: clauses } : {};
}

router.get("/", async (req, res, next) => {
  try {
    const input = queryValues(req.query, parameters);
    const limit = pageLimit(input.limit);
    const filter = await buildQuery(input);
    const page = await AdminActivityLog.find(filter, "adminId action resourceType resourceId result httpStatus requestId createdAt")
      .sort(chronology).limit(limit + 1).maxTimeMS(queryTimeout).lean();
    const rows = page.slice(0, limit);
    const ids = [...new Set(rows.flatMap(row => row.adminId ? [String(row.adminId)] : []))];
    const names = new Map((await User.find({ _id: { $in: ids }, role: "admin" }, "name").maxTimeMS(queryTimeout).lean())
      .map(user => [String(user._id), user.name]));
    res.json({ ok: true, definitions, next: pageCursor(page, limit), entries: rows.map(row => ({
      id: String(row._id), adminId: row.adminId ?? null, adminName: row.adminId ? names.get(String(row.adminId)) ?? null : null,
      action: row.action, resourceType: row.resourceType, resourceId: row.resourceId ?? null,
      result: row.result, httpStatus: row.httpStatus, requestId: row.requestId, createdAt: row.createdAt
    })) });
  } catch (error) { next(error); }
});

module.exports = router;
