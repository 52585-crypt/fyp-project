const { DEFAULT_MONETIZATION } = require("../config/monetization");
const { PlatformSettings } = require("../models/PlatformSettings");

const SETTINGS_KEY = "monetization";
const CATEGORIES = ["car_towing", "fuel_delivery", "mechanic"];

function roundMoney(value) {
  return Math.round(Number(value || 0));
}

function pickNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mergeCategoryMap(defaults, stored) {
  return CATEGORIES.reduce((acc, category) => {
    acc[category] = pickNumber(stored?.[category], defaults[category]);
    return acc;
  }, {});
}

function mergeWithDefaults(stored) {
  return {
    commissionRates: mergeCategoryMap(DEFAULT_MONETIZATION.commissionRates, stored?.commissionRates),
    platformFees: mergeCategoryMap(DEFAULT_MONETIZATION.platformFees, stored?.platformFees),
    providerDebtLimit: pickNumber(stored?.providerDebtLimit, DEFAULT_MONETIZATION.providerDebtLimit),
    minTopupAmount: pickNumber(stored?.minTopupAmount, DEFAULT_MONETIZATION.minTopupAmount)
  };
}

async function getMonetizationSettings() {
  const doc = await PlatformSettings.findOne({ key: SETTINGS_KEY }).lean();
  return mergeWithDefaults(doc?.monetization);
}

function validationError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

async function updateMonetizationSettings(input = {}) {
  const current = await getMonetizationSettings();
  const next = mergeWithDefaults({
    commissionRates: { ...current.commissionRates, ...(input.commissionRates || {}) },
    platformFees: { ...current.platformFees, ...(input.platformFees || {}) },
    providerDebtLimit: input.providerDebtLimit ?? current.providerDebtLimit,
    minTopupAmount: input.minTopupAmount ?? current.minTopupAmount
  });

  CATEGORIES.forEach((category) => {
    const rate = next.commissionRates[category];
    if (!(rate >= 0 && rate <= 0.5)) throw validationError(`Commission rate for ${category} must be between 0 and 0.5`);
    const fee = next.platformFees[category];
    if (!(fee >= 0 && fee <= 5000)) throw validationError(`Platform fee for ${category} must be between 0 and 5000`);
    next.platformFees[category] = roundMoney(fee);
  });
  if (!(next.providerDebtLimit >= 0)) throw validationError("providerDebtLimit must be 0 or more");
  if (!(next.minTopupAmount >= 0)) throw validationError("minTopupAmount must be 0 or more");

  await PlatformSettings.updateOne(
    { key: SETTINGS_KEY },
    { $set: { monetization: next } },
    { upsert: true }
  );

  return next;
}

// Older requests were saved without a line kind; infer it from the label.
function lineKind(line) {
  if (line?.kind) return line.kind;
  const label = String(line?.label || "").toLowerCase();
  if (label.startsWith("service fee")) return "platform_fee";
  if (label.startsWith("delivery fee")) return "delivery_fee";
  if (label.startsWith("petrol") || label.startsWith("diesel")) return "fuel_cost";
  if (label.startsWith("extra work")) return "extra_work";
  return "service";
}

function sumLines(lines, kinds) {
  return (lines || [])
    .filter((line) => kinds.includes(lineKind(line)))
    .reduce((sum, line) => sum + Number(line.amount || 0), 0);
}

// Which part of the bill the commission is taken from, per service.
function commissionBaseFor(category, lines) {
  if (category === "fuel_delivery") return sumLines(lines, ["delivery_fee"]);
  if (category === "mechanic") return sumLines(lines, ["service", "extra_work"]);
  return sumLines(lines, ["service"]);
}

/**
 * Split a request total into provider and platform shares.
 *
 *   platformFee     = all "Service fee" lines (paid by customer, 100% platform)
 *   commission      = commissionBase x commissionRate
 *   providerEarning = total - platformFee - commission
 *   platformRevenue = commission + platformFee
 */
function computeSettlement(category, lines, commissionRate) {
  const total = (lines || []).reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const platformFee = roundMoney(sumLines(lines, ["platform_fee"]));
  const commissionBase = roundMoney(commissionBaseFor(category, lines));
  const commission = roundMoney(commissionBase * commissionRate);
  const providerEarning = Math.max(0, roundMoney(total - platformFee - commission));

  return {
    commissionRate,
    commissionBase,
    commission,
    platformFee,
    providerEarning,
    platformRevenue: commission + platformFee
  };
}

// Recalculate totals and settlement after the estimate lines changed.
// Keeps the commission rate that was snapshotted when the request was created.
function refreshRequestMoney(request) {
  request.estimate.total = roundMoney(
    (request.estimate.lines || []).reduce((sum, line) => sum + Number(line.amount || 0), 0)
  );

  if (!request.settlement) return;

  const next = computeSettlement(request.category, request.estimate.lines, request.settlement.commissionRate);
  Object.assign(request.settlement, next);
}

module.exports = {
  CATEGORIES,
  getMonetizationSettings,
  updateMonetizationSettings,
  computeSettlement,
  refreshRequestMoney,
  lineKind,
  roundMoney
};
