const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");
const { AdminActivityLog, actions } = require("../models/AdminActivityLog");
const { objectId } = require("./adminHistory");

function eventRecord(req, res, event, result, httpStatus) {
  req.auditRequestId ??= randomUUID();
  res.set("X-Request-ID", req.auditRequestId);
  return {
    adminId: event.adminId ?? (req.authRole === "admin" ? req.user._id : null),
    action: event.action,
    resourceType: actions[event.action].resource,
    resourceId: objectId(event.resourceId),
    result, httpStatus, requestId: req.auditRequestId
  };
}

function auditFailure(res, record, error) {
  res.set("X-Admin-Audit-Status", "unavailable");
  console.error("Admin activity write failed", {
    requestId: record.requestId, action: record.action, code: Number.isInteger(error?.code) ? error.code : undefined
  });
}

function saveActivity(record, session) {
  const row = new AdminActivityLog(record);
  if (session) return row.save({ session });
  return row.save({ w: "majority", wtimeout: 4000 });
}

async function recordActivity(req, res, event, result, httpStatus) {
  const record = eventRecord(req, res, event, result, httpStatus);
  try {
    await saveActivity(record);
  } catch (error) {
    // A sign-out or committed standalone write must still report its actual outcome.
    auditFailure(res, record, error);
  }
}

async function auditedChange(req, res, event, change) {
  const topology = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!topology.setName && topology.msg !== "isdbgrid") {
    const value = await change();
    if (value) await recordActivity(req, res, event, "success", 200);
    return value;
  }

  const record = eventRecord(req, res, event, "success", 200);
  let auditError;
  try {
    // Initialize before opening the transaction, including on a fresh database.
    try { await AdminActivityLog.init(); } catch (error) { auditError = error; throw error; }
    return await mongoose.connection.transaction(async session => {
      auditError = undefined;
      const value = await change(session);
      if (value) {
        try { await saveActivity(record, session); } catch (error) { auditError = error; throw error; }
      }
      return value;
    });
  } catch (error) {
    if (!auditError) throw error;
    auditFailure(res, record, auditError);
    throw Object.assign(new Error("Audit storage is temporarily unavailable. No change was made."), { statusCode: 503, expose: true,
      publicCode: "ADMIN_AUDIT_UNAVAILABLE", publicMessage: "Audit storage is temporarily unavailable. No change was made." });
  }
}

async function recordRejectedAction(req, res, event, error, statuses = [400, 404, 409]) {
  const status = error.statusCode || error.status || (["CastError", "ValidationError"].includes(error.name) ? 400 : null);
  if (event && statuses.includes(status)) await recordActivity(req, res, event, "failed", status);
}

module.exports = { recordActivity, auditedChange, recordRejectedAction };
