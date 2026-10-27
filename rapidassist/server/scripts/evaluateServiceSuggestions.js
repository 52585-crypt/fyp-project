require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { suggestService } = require("../src/services/serviceSuggestion");
const {
  SERVICE_LABELS,
  normalizeDatasetLabel,
  summarizeSuggestionEvaluation
} = require("../src/ai/serviceSuggestion.metrics");

const datasetPath = path.resolve(__dirname, "../../datasets/rapidassist_service_recommendation_1200.csv");

function positiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function loadDataset(filename = datasetPath) {
  const [header, ...rows] = parseCsv(fs.readFileSync(filename, "utf8"));
  if (!header || header[0] !== "text" || header[1] !== "label") throw new Error("Dataset must have text,label columns");
  return rows.map(([text, label], index) => {
    const expected = normalizeDatasetLabel(label);
    if (!text?.trim() || !expected) throw new Error(`Invalid dataset row ${index + 2}`);
    return { text: text.trim(), expected };
  });
}

function stratifiedSample(rows, limit) {
  const selected = [];
  const counts = Object.fromEntries(SERVICE_LABELS.map((label) => [label, 0]));
  const targets = Object.fromEntries(
    SERVICE_LABELS.map((label, index) => [label, Math.floor(limit / SERVICE_LABELS.length) + (index < limit % SERVICE_LABELS.length ? 1 : 0)])
  );
  for (const row of rows) {
    if (counts[row.expected] < targets[row.expected]) {
      selected.push(row);
      counts[row.expected] += 1;
    }
    if (selected.length === limit) break;
  }
  if (selected.length !== limit) throw new Error(`Dataset cannot provide a ${limit}-row stratified sample`);
  return selected;
}

async function wait(ms) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is required for live evaluation");
  const rows = loadDataset();
  const limit = positiveInteger(process.env.AI_EVAL_LIMIT, 30, rows.length);
  const delayMs = positiveInteger(process.env.AI_EVAL_DELAY_MS, 250, 10_000);
  const sample = stratifiedSample(rows, limit);
  const records = [];

  for (let index = 0; index < sample.length; index += 1) {
    const row = sample[index];
    const startedAt = Date.now();
    try {
      const suggestion = await suggestService({ description: row.text, clarifications: [] });
      records.push({
        expected: row.expected,
        predicted: suggestion.recommendedService,
        outcome: suggestion.needsClarification ? "clarification" : suggestion.recommendedService ? "suggested" : "unsupported",
        latencyMs: Date.now() - startedAt
      });
    } catch (error) {
      records.push({ expected: row.expected, predicted: null, outcome: "error", latencyMs: Date.now() - startedAt });
      console.error(`Evaluation request ${index + 1} failed:`, error.message);
    }
    console.log(`Evaluated ${index + 1}/${sample.length}`);
    if (index + 1 < sample.length) await wait(delayMs);
  }

  console.log(JSON.stringify(summarizeSuggestionEvaluation(records), null, 2));
  if (records.some((record) => record.outcome === "error")) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { loadDataset, parseCsv, stratifiedSample };

