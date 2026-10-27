const { Invoice } = require("../models/Invoice");

function invoiceNumber(request) {
  const year = new Date(request.completedAt || Date.now()).getFullYear();
  return `RA-${year}-${String(request._id).slice(-8).toUpperCase()}`;
}

function buildInvoiceLines(request) {
  const approvedExtra = request.mechanicDetails?.extraWork?.approvedByUser
    ? Number(request.mechanicDetails.extraWork.partPrice || 0) + Number(request.mechanicDetails.extraWork.laborCharge || 0)
    : 0;
  const baseLines = (request.estimate?.lines || [])
    .filter((line) => !String(line.label).toLowerCase().includes("extra work"))
    .map((line) => ({ label: line.label, amountMinor: Math.round(Number(line.amount || 0) * 100) }));
  if (approvedExtra > 0) baseLines.push({ label: "Approved extra work", amountMinor: Math.round(approvedExtra * 100) });
  return baseLines;
}

async function ensureFinalizedInvoice(request) {
  if (request.status !== "completed") {
    const error = new Error("Invoice is available after job completion");
    error.statusCode = 409;
    throw error;
  }
  const existing = await Invoice.findOne({ requestId: request._id });
  if (existing) return existing;

  const lines = buildInvoiceLines(request);
  const totalMinor = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  const serviceFeeMinor = lines
    .filter((line) => line.label.toLowerCase().includes("service fee"))
    .reduce((sum, line) => sum + line.amountMinor, 0);
  try {
    return await Invoice.create({
      requestId: request._id,
      userId: request.userId,
      providerId: request.providerId,
      invoiceNumber: invoiceNumber(request),
      currency: request.estimate?.currency || "PKR",
      lines,
      totalMinor,
      serviceFeeMinor,
      providerEarningsMinor: Math.max(0, totalMinor - serviceFeeMinor),
      status: "finalized",
      finalizedAt: new Date()
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const concurrentInvoice = await Invoice.findOne({ requestId: request._id });
    if (!concurrentInvoice) throw error;
    return concurrentInvoice;
  }
}

module.exports = { ensureFinalizedInvoice };
