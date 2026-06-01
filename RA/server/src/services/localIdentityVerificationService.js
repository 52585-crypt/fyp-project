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

