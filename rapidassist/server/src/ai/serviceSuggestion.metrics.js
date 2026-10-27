const SERVICE_LABELS = ["mechanic", "fuel_delivery", "car_towing"];

function normalizeDatasetLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();
  if (normalized === "towing") return "car_towing";
  return SERVICE_LABELS.includes(normalized) ? normalized : null;
}

function rounded(value) {
  return Number(value.toFixed(4));
}

function ratio(numerator, denominator) {
  return denominator ? rounded(numerator / denominator) : 0;
}

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

function summarizeSuggestionEvaluation(records) {
  if (!Array.isArray(records) || records.length === 0) throw new Error("Evaluation records are required");

  const perClass = {};
  for (const label of SERVICE_LABELS) {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    for (const record of records) {
      if (record.expected === label && record.predicted === label) truePositive += 1;
      if (record.expected !== label && record.predicted === label) falsePositive += 1;
      if (record.expected === label && record.predicted !== label) falseNegative += 1;
    }
    const precision = ratio(truePositive, truePositive + falsePositive);
    const recall = ratio(truePositive, truePositive + falseNegative);
    perClass[label] = {
      precision,
      recall,
      f1: precision + recall ? rounded((2 * precision * recall) / (precision + recall)) : 0,
      support: records.filter((record) => record.expected === label).length
    };
  }

  const latencies = records.map((record) => Number(record.latencyMs) || 0);
  const correct = records.filter((record) => record.expected === record.predicted).length;
  const clarifications = records.filter((record) => record.outcome === "clarification").length;
  const failures = records.filter((record) => record.outcome === "error").length;

  return {
    examples: records.length,
    correct,
    accuracy: ratio(correct, records.length),
    clarificationFrequency: ratio(clarifications, records.length),
    failures,
    averageLatencyMs: Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
    p95LatencyMs: Math.round(percentile(latencies, 0.95)),
    perClass
  };
}

module.exports = {
  SERVICE_LABELS,
  normalizeDatasetLabel,
  summarizeSuggestionEvaluation
};

