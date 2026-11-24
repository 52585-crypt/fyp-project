/**
 * Free "photo se gaari ki problem pehchano" using the pre-trained CLIP model.
 *
 * CLIP is zero-shot: we do not train anything. We give it a list of text
 * descriptions ("a photo of a flat car tyre", ...) and it scores how well the
 * photo matches each one. Each description is mapped to a RapidAssist service
 * category (and a mechanic issue type where it applies).
 *
 * Runs locally via transformers.js (onnxruntime on CPU). The model (~90 MB,
 * 8-bit quantized) is downloaded once from huggingface.co and cached in
 * assets/hf-models, after which it works offline.
 */
const path = require("path");
const sharp = require("sharp");

const MODEL_ID = process.env.VEHICLE_ISSUE_MODEL || "Xenova/clip-vit-base-patch32";
const CACHE_DIR = path.resolve(__dirname, "../../assets/hf-models");
const MIN_CONFIDENCE = Number(process.env.VEHICLE_ISSUE_MIN_CONFIDENCE) || 0.3;

// category: car_towing | fuel_delivery | mechanic | null (not a vehicle problem)
// issueType: one of MECHANIC_ISSUES in models/ServiceRequest.js, only for mechanic
const LABELS = [
  { prompt: "a photo of a flat or punctured car tyre", category: "mechanic", issueType: "tyre", title: "Flat / punctured tyre" },
  { prompt: "a photo of a car battery under the hood", category: "mechanic", issueType: "battery", title: "Battery problem" },
  { prompt: "a photo of jump starting a car with jumper cables", category: "mechanic", issueType: "battery", title: "Battery problem" },
  { prompt: "a photo of an open car engine bay", category: "mechanic", issueType: "engine", title: "Engine problem" },
  { prompt: "a photo of smoke or steam coming from a car engine", category: "mechanic", issueType: "overheating", title: "Engine overheating" },
  { prompt: "a photo of a car brake disc and brake pads", category: "mechanic", issueType: "brake", title: "Brake problem" },
  { prompt: "a photo of a car dashboard with warning lights", category: "mechanic", issueType: "general_inspection", title: "Warning light / general inspection" },
  { prompt: "a photo of a car fuel gauge showing empty", category: "fuel_delivery", issueType: null, title: "Fuel finished" },
  { prompt: "a photo of a petrol pump nozzle or fuel cap of a car", category: "fuel_delivery", issueType: null, title: "Fuel needed" },
  { prompt: "a photo of a damaged car after a road accident", category: "car_towing", issueType: null, title: "Accident damage - towing needed" },
  { prompt: "a photo of a car with a broken or dented bumper", category: "car_towing", issueType: null, title: "Accident damage - towing needed" },
  { prompt: "a photo of a car on a tow truck", category: "car_towing", issueType: null, title: "Towing needed" },
  { prompt: "a photo of a car stuck in a ditch or mud", category: "car_towing", issueType: null, title: "Car stuck - towing needed" },
  { prompt: "a photo of a normal clean undamaged car", category: null, issueType: null, title: "No visible problem" },
  { prompt: "a selfie or photo of a person", category: null, issueType: null, title: "Not a vehicle photo" },
  { prompt: "a photo of a document or paper", category: null, issueType: null, title: "Not a vehicle photo" },
  { prompt: "a photo of a room, food or random objects", category: null, issueType: null, title: "Not a vehicle photo" }
];

let classifierPromise = null;

function loadClassifier() {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const { pipeline, env } = require("@huggingface/transformers");
      env.cacheDir = CACHE_DIR;
      return pipeline("zero-shot-image-classification", MODEL_ID, { dtype: "q8" });
    })().catch((err) => {
      classifierPromise = null; // retry on next request
      throw err;
    });
  }
  return classifierPromise;
}

function dataUriToBuffer(dataUri) {
  const value = String(dataUri || "");
  const comma = value.indexOf(",");
  if (!value.startsWith("data:image/") || comma === -1) {
    const err = new Error("image must be a base64 data:image/... URI");
    err.statusCode = 400;
    throw err;
  }
  return Buffer.from(value.slice(comma + 1), "base64");
}

async function bufferToRawImage(buffer) {
  const { RawImage } = require("@huggingface/transformers");
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({ width: 448, height: 448, fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
}

/**
 * Classify a vehicle problem photo.
 * Returns { detected, category, issueType, title, confidence, top }
 */
async function classifyVehicleIssue(dataUri) {
  const image = await bufferToRawImage(dataUriToBuffer(dataUri));
  const classifier = await loadClassifier();
  const results = await classifier(image, LABELS.map((label) => label.prompt), {
    hypothesis_template: "{}"
  });

  // Several prompts can share the same title (e.g. two battery prompts): add their scores.
  const byTitle = new Map();
  for (const result of results) {
    const label = LABELS.find((item) => item.prompt === result.label);
    const entry = byTitle.get(label.title) || { ...label, score: 0 };
    entry.score += result.score;
    byTitle.set(label.title, entry);
  }

  const ranked = [...byTitle.values()].sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const detected = Boolean(best.category) && best.score >= MIN_CONFIDENCE;

  return {
    detected,
    category: detected ? best.category : null,
    issueType: detected ? best.issueType : null,
    title: best.title,
    confidence: Number(best.score.toFixed(3)),
    top: ranked.slice(0, 3).map((item) => ({
      title: item.title,
      category: item.category,
      issueType: item.issueType,
      score: Number(item.score.toFixed(3))
    }))
  };
}

module.exports = { classifyVehicleIssue, loadClassifier, LABELS };
