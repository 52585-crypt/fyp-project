/**
 * Free, local face checks for provider sign-up (no paid API).
 *
 * Uses the pre-trained face-api.js models in assets/face-models:
 *   - tiny face detector         -> find the face
 *   - 68-point landmark model    -> estimate head turn (liveness)
 *   - face recognition model     -> 128-number face descriptor (same person / duplicate check)
 *
 * 1. Liveness (head-turn): provider takes 3 selfies: straight, turned left, turned right.
 *    A printed photo or a screen held up to the camera cannot turn its head, so the
 *    3 photos would all show the same pose and the check fails.
 * 2. Same person: the left/right selfies must be the same person as the straight selfie.
 * 3. Duplicate face: the straight selfie is compared with every other registered provider,
 *    so one person cannot open several provider accounts with different CNICs/phones.
 */
const path = require("path");
const sharp = require("sharp");
const tf = require("@tensorflow/tfjs");
const { setWasmPaths } = require("@tensorflow/tfjs-backend-wasm");
const faceapi = require("@vladmandic/face-api/dist/face-api.node-wasm.js");

const FACE_MODEL_DIR = path.resolve(__dirname, "../../assets/face-models");
const WASM_DIR = path.dirname(require.resolve("@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm"));

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

// All thresholds can be tuned from .env without code changes.
const CONFIG = {
  // Head-turn score: 0 = looking straight, about 0.15-0.30 = clearly turned.
  maxFrontYaw: numberFromEnv("FACE_MAX_FRONT_YAW", 0.1),
  // Each turned selfie must differ from the straight one by at least this much.
  minTurnYaw: numberFromEnv("FACE_MIN_TURN_YAW", 0.12),
  // face-api descriptor distance: below ~0.6 usually means the same person.
  samePersonDistance: numberFromEnv("FACE_SAME_PERSON_DISTANCE", 0.6),
  // Stricter limit for flagging a duplicate account.
  duplicateDistance: numberFromEnv("FACE_DUPLICATE_DISTANCE", 0.45)
};

let modelsPromise = null;

function loadModels() {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      setWasmPaths(`${WASM_DIR}${path.sep}`);
      await tf.setBackend("wasm");
      await tf.ready();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromDisk(FACE_MODEL_DIR),
        faceapi.nets.faceLandmark68TinyNet.loadFromDisk(FACE_MODEL_DIR),
        faceapi.nets.faceRecognitionNet.loadFromDisk(FACE_MODEL_DIR)
      ]);
    })().catch((err) => {
      modelsPromise = null; // allow a retry on the next request
      throw err;
    });
  }
  return modelsPromise;
}

function dataUriToBuffer(dataUri) {
  const value = String(dataUri || "");
  const comma = value.indexOf(",");
  if (!value.startsWith("data:image/") || comma === -1) {
    throw new Error("Image must be a base64 data URI");
  }
  return Buffer.from(value.slice(comma + 1), "base64");
}

async function imageToTensor(buffer) {
  const { data, info } = await sharp(buffer)
    .rotate() // respect phone EXIF orientation
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], "int32");
}

/**
 * Head-turn score from the 68 landmarks.
 * Compares where the nose tip sits between the left and right jaw edge:
 * ~0 when looking straight, negative/positive when the head is turned.
 * The sign depends on camera mirroring, so callers only rely on magnitude
 * and on left/right having opposite signs.
 */
function estimateYaw(landmarks) {
  const points = landmarks.positions;
  const jawLeft = points[0];
  const jawRight = points[16];
  const noseTip = points[30];
  const width = jawRight.x - jawLeft.x;
  if (!width) return 0;
  return (noseTip.x - jawLeft.x) / width - 0.5;
}

async function analyzeFace(dataUri) {
  await loadModels();
  const tensor = await imageToTensor(dataUriToBuffer(dataUri));
  try {
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });
    const faces = await faceapi.detectAllFaces(tensor, options).withFaceLandmarks(true).withFaceDescriptors();

    if (faces.length === 0) return { faceCount: 0 };

    const main = faces.reduce((best, face) => (face.detection.score > best.detection.score ? face : best));
    return {
      faceCount: faces.length,
      yaw: round(estimateYaw(main.landmarks)),
      descriptor: Array.from(main.descriptor),
      detectionScore: round(main.detection.score)
    };
  } finally {
    tensor.dispose();
  }
}

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

/**
 * Head-turn liveness + same-person check on 3 selfies.
 * Returns { passed, reason, yaw, distances, descriptor }.
 */
async function checkLiveness({ selfieUrl, selfieLeftUrl, selfieRightUrl }) {
  await loadModels();

  const [front, left, right] = await Promise.all([
    analyzeFace(selfieUrl),
    analyzeFace(selfieLeftUrl),
    analyzeFace(selfieRightUrl)
  ]);

  const fail = (reason, extra = {}) => ({ passed: false, reason, ...extra });

  const labelled = [
    ["straight", front],
    ["left-turn", left],
    ["right-turn", right]
  ];
  for (const [label, face] of labelled) {
    if (face.faceCount === 0) return fail(`No clear face found in the ${label} selfie. Retake it in good light.`);
    if (face.faceCount > 1) return fail(`More than one face found in the ${label} selfie. Only you should be in the photo.`);
  }

  const yaw = { front: front.yaw, left: left.yaw, right: right.yaw };

  if (Math.abs(front.yaw) > CONFIG.maxFrontYaw) {
    return fail("Look straight at the camera in the first selfie.", { yaw });
  }
  const leftTurn = Math.abs(left.yaw - front.yaw);
  const rightTurn = Math.abs(right.yaw - front.yaw);
  if (leftTurn < CONFIG.minTurnYaw || rightTurn < CONFIG.minTurnYaw) {
    return fail("Head-turn check failed. Turn your head clearly to the left and to the right.", { yaw });
  }
  if (Math.sign(left.yaw - front.yaw) === Math.sign(right.yaw - front.yaw)) {
    return fail("Head-turn check failed. The left and right selfies must be turned in opposite directions.", { yaw });
  }

  const distances = {
    left: round(euclideanDistance(front.descriptor, left.descriptor)),
    right: round(euclideanDistance(front.descriptor, right.descriptor))
  };

  if (distances.left > CONFIG.samePersonDistance || distances.right > CONFIG.samePersonDistance) {
    return fail("The three selfies do not appear to be the same person.", { yaw, distances });
  }

  return { passed: true, reason: null, yaw, distances, descriptor: front.descriptor };
}

/**
 * Compare a face descriptor with already registered providers.
 * `candidates` = [{ id, name, phone, faceDescriptor }]
 */
function findDuplicateFace(descriptor, candidates) {
  let closest = null;

  for (const candidate of candidates) {
    if (!Array.isArray(candidate.faceDescriptor) || candidate.faceDescriptor.length !== descriptor.length) continue;
    const distance = euclideanDistance(descriptor, candidate.faceDescriptor);
    if (!closest || distance < closest.distance) closest = { ...candidate, distance };
  }

  if (!closest || closest.distance > CONFIG.duplicateDistance) {
    return { found: false, distance: closest ? round(closest.distance) : null };
  }

  return {
    found: true,
    matchedUserId: closest.id,
    matchedName: closest.name,
    matchedPhone: closest.phone,
    distance: round(closest.distance)
  };
}

module.exports = {
  CONFIG,
  loadModels,
  analyzeFace,
  checkLiveness,
  findDuplicateFace,
  euclideanDistance
};
