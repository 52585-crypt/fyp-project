#!/usr/bin/env node
// Reports indexes the code relies on that are missing from the database, and creates them with --apply.
// Dry run by default. It never drops or rebuilds an index: extra or differing indexes are only reported.
//
//   node scripts/checkIndexes.js                 report, against the local dev database
//   node scripts/checkIndexes.js --apply         also create the missing indexes
//   options: --uri=...  --production-env (use server/.env)  --allow-remote (needed for Atlas or any non-local host)
//
// Checked: every index declared in src/models (schema.index and field-level index/unique), plus the
// one-pending-offer-per-provider index the server builds at startup (services/pendingOfferIndex.js).
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectForScript } = require("./lib/scriptDatabase");
const { PENDING_OFFER_INDEX_KEY, PENDING_OFFER_INDEX_OPTIONS } = require("../src/services/pendingOfferIndex");

const MODELS_DIR = path.join(__dirname, "../src/models");
// Index options that change behaviour; build-only options (background etc.) are ignored when comparing.
const MEANINGFUL = ["unique", "sparse", "partialFilterExpression", "expireAfterSeconds"];

function loadModels() {
  for (const file of fs.readdirSync(MODELS_DIR)) if (file.endsWith(".js")) require(path.join(MODELS_DIR, file));
  return mongoose.modelNames().sort().map((name) => mongoose.model(name));
}

const keyOf = (key) => JSON.stringify(Object.entries(key));
const optionsOf = (options = {}) => JSON.stringify(MEANINGFUL.filter((k) => options[k] !== undefined && options[k] !== false).map((k) => [k, options[k]]));

/** Every index the code expects, per collection: [{ model, key, options }]. */
function requiredIndexes(models = loadModels()) {
  const required = models.flatMap((model) => model.schema.indexes().map(([key, options]) => ({ model, key, options: options || {} })));
  const offers = models.find((m) => m.modelName === "DispatchOffer");
  if (offers) required.push({ model: offers, key: { ...PENDING_OFFER_INDEX_KEY }, options: { ...PENDING_OFFER_INDEX_OPTIONS } });
  return required;
}

async function existingIndexes(model) {
  try {
    return await model.collection.indexes();
  } catch (error) {
    if (error?.codeName === "NamespaceNotFound" || error?.code === 26) return [];
    throw error;
  }
}

/** { missing, differing, extra } across all collections. Read-only. */
async function planIndexes(models = loadModels()) {
  const required = requiredIndexes(models);
  const plan = { missing: [], differing: [], extra: [] };
  for (const model of models) {
    const existing = await existingIndexes(model);
    const wanted = required.filter((r) => r.model === model);
    // One key can carry several indexes with different options (e.g. DispatchOffer.providerId: a plain index and
    // the partial unique one-pending-offer index), so an index matches only on key + behaviour-changing options.
    const same = (index, want) => keyOf(index.key) === keyOf(want.key) && optionsOf(index) === optionsOf(want.options);
    for (const want of wanted) {
      if (existing.some((index) => same(index, want))) continue;
      const named = want.options.name && existing.find((index) => index.name === want.options.name);
      if (named) plan.differing.push({ ...want, found: named });
      else plan.missing.push(want);
    }
    for (const index of existing) {
      if (index.name === "_id_" || wanted.some((w) => same(index, w) || (w.options.name && w.options.name === index.name))) continue;
      plan.extra.push({ model, key: index.key, options: index });
    }
  }
  return plan;
}

/** Creates the missing indexes only. Returns the names created. */
async function applyMissing(plan) {
  const created = [];
  for (const { model, key, options } of plan.missing) created.push(await model.collection.createIndex(key, options));
  return created;
}

function describe({ model, key, options }) {
  const extras = optionsOf(options) === "[]" ? "" : ` ${optionsOf(options)}`;
  return `${model.collection.collectionName}: ${JSON.stringify(key)}${options.name ? ` (${options.name})` : ""}${extras}`;
}

async function main() {
  const args = process.argv.slice(2);
  await connectForScript(args);
  try {
    const plan = await planIndexes();
    console.log(`Missing indexes: ${plan.missing.length}`);
    plan.missing.forEach((i) => console.log("  + " + describe(i)));
    if (plan.differing.length) {
      console.log(`Differing options (not changed; fix by hand): ${plan.differing.length}`);
      plan.differing.forEach((i) => console.log(`  ~ ${describe(i)}  database has ${optionsOf(i.found)} (${i.found.name})`));
    }
    if (plan.extra.length) {
      console.log(`Indexes not declared in code (left alone): ${plan.extra.length}`);
      plan.extra.forEach((i) => console.log(`  ? ${i.model.collection.collectionName}: ${JSON.stringify(i.key)} (${i.options.name})`));
    }
    if (!args.includes("--apply")) {
      console.log(plan.missing.length ? "Dry run: nothing changed. Re-run with --apply to create the missing indexes." : "Dry run: nothing to do.");
      return;
    }
    const created = await applyMissing(plan);
    console.log(`Created ${created.length} index(es)${created.length ? ": " + created.join(", ") : ""}.`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { applyMissing, planIndexes, requiredIndexes };
