import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import * as tf from "@tensorflow/tfjs";
import * as faceapi from "@vladmandic/face-api";
import { Canvas, Image, ImageData, loadImage } from "canvas";
import { createWorker } from "tesseract.js";

faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FACE_MODEL_DIR = path.resolve(__dirname, "../../assets/face-models");
const TESSDATA_DIR = path.resolve(__dirname, "../../assets/tessdata");
const IMAGE_FETCH_TIMEOUT_MS = Number(process.env.IDENTITY_IMAGE_FETCH_TIMEOUT_MS || 15000);
const FACE_MATCH_THRESHOLD = Number(process.env.IDENTITY_FACE_MATCH_THRESHOLD || 0.5);

let modelLoadPromise = null;
let ocrWorkerPromise = null;

function buildFailure(reason, details = {}) {
  return {
    ok: false,
    reason,
    ...details,
  };
}

function resolveImageSource(source) {
  if (typeof source !== "string" || !source.trim()) {
    throw new Error("Image source is required");
  }

  return source.trim();
}

async function fetchImageBuffer(source) {
  const normalized = resolveImageSource(source);

  if (normalized.startsWith("data:")) {
    const separator = normalized.indexOf(",");

    if (separator === -1) {
      throw new Error("Invalid data URL image");
    }

    return Buffer.from(normalized.slice(separator + 1), "base64");
  }

  if (/^https?:\/\//i.test(normalized)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(normalized, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`Image download failed with status ${response.status}`);
      }

      return Buffer.from(await response.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  }

  return fs.readFile(normalized);
}

async function ensurePngBuffer(buffer, width = 1800) {
  return sharp(buffer)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .png()
    .toBuffer();
}

async function buildOcrBuffer(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 2200, withoutEnlargement: true })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker("eng", 1, {
      langPath: TESSDATA_DIR,
      gzip: true,
    });
  }

  return ocrWorkerPromise;
}

function normalizeCnicOcrText(text) {
  return String(text || "")
    .replace(/[OoQqD]/g, "0")
    .replace(/[Il|!]/g, "1")
    .replace(/[Zz]/g, "2")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8");
}

function extractCnicCandidates(text) {
  const normalized = normalizeCnicOcrText(text);
  const compact = normalized.replace(/[^0-9]/g, "");
  const candidates = new Set();

  for (const match of normalized.matchAll(/\d{5}\D*\d{7}\D*\d/g)) {
    const digits = match[0].replace(/\D/g, "");

    if (digits.length === 13) {
      candidates.add(digits);
    }
  }

  for (let index = 0; index <= compact.length - 13; index += 1) {
    candidates.add(compact.slice(index, index + 13));
  }

  return [...candidates].filter((value) => /^\d{13}$/.test(value));
}

async function extractBestCnicFromImage(buffer) {
  const worker = await getOcrWorker();
  const ocrBuffer = await buildOcrBuffer(buffer);
  const result = await worker.recognize(ocrBuffer);
  const text = result?.data?.text || "";
  const candidates = extractCnicCandidates(text);

  return {
    text,
    candidates,
    extractedCnic: candidates[0] || null,
