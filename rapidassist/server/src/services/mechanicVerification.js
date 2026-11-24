const sharp = require("sharp");
const { RekognitionClient, DetectFacesCommand, CompareFacesCommand } = require("@aws-sdk/client-rekognition");
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { createAwsClientConfig } = require("../config/aws");

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;
const REVIEW_THRESHOLD = 90;
const CONSENT_VERSION = "mechanic-face-verification-v1";

function verificationError(statusCode, message, publicCode) {
  return Object.assign(new Error(message), { statusCode, expose: true, publicMessage: message, publicCode });
}

async function normalizeImage(data, label) {
  if (typeof data !== "string") throw verificationError(400, `${label} is required.`);
  if (data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32) {
    throw verificationError(413, `${label} must be at most 4 MiB.`);
  }
  const header = /^data:image\/(jpeg|png);base64,/.exec(data);
  if (!header) throw verificationError(415, `${label} must be a JPEG or PNG data URI.`);
  const encoded = data.slice(header[0].length);
  const bytes = Buffer.from(encoded, "base64");
  try {
    if (!bytes.length || bytes.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      throw verificationError(400, `${label} contains invalid base64.`);
    }
    if (bytes.length > MAX_IMAGE_BYTES) throw verificationError(413, `${label} must be at most 4 MiB.`);
    const image = sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== header[1]) throw verificationError(415, `${label} format does not match its data URI.`);
    if ((metadata.pages ?? 1) !== 1 || metadata.width < 80 || metadata.height < 80) {
      throw verificationError(422, `${label} must be a single image at least 80 × 80 pixels.`);
    }
    return await image.rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#fff" }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error.statusCode) throw error;
    throw verificationError(422, `${label} cannot be decoded or exceeds the pixel limit.`);
  } finally {
    bytes.fill(0);
  }
}

function portraitRegion(region) {
  const { left, top, width, height } = region || {};
  if (![left, top, width, height].every(Number.isFinite)
    || left < 0 || top < 0 || width <= 0 || height <= 0 || left + width > 1 || top + height > 1) {
    throw verificationError(400, "CNIC portrait region must fit within the image using coordinates from 0 to 1.");
  }
  return { left, top, width, height };
}

function faceRegion(box) {
  if (!box || ![box.Left, box.Top, box.Width, box.Height].every(Number.isFinite)) {
    throw verificationError(503, "Face verification could not locate the CNIC portrait. Please retry.", "VERIFICATION_AI_UNAVAILABLE");
  }
  const left = Math.max(0, box.Left - box.Width * 0.4);
  const top = Math.max(0, box.Top - box.Height * 0.4);
  return {
    left, top,
    width: Math.min(1, box.Left + box.Width * 1.4) - left,
    height: Math.min(1, box.Top + box.Height * 1.4) - top
  };
}

async function cropPortrait(image, region) {
  const { width, height } = image.info;
  const left = Math.floor(region.left * width);
  const top = Math.floor(region.top * height);
  const right = Math.min(width, Math.ceil((region.left + region.width) * width));
  const bottom = Math.min(height, Math.ceil((region.top + region.height) * height));
  if (right - left < 80 || bottom - top < 80) {
    throw verificationError(422, "The CNIC portrait is too small. Retake the photo closer to the card.");
  }
  return sharp(image.data).extract({ left, top, width: right - left, height: bottom - top }).jpeg().toBuffer();
}

function requireOneFace(faces, label) {
  if (faces.length !== 1) {
    const issue = faces.length ? "contains multiple faces" : "contains no detectable face";
    throw verificationError(422, `${label} ${issue}. Supply an image with exactly one face.`);
  }
}

async function send(client, command, failureCode = "VERIFICATION_AI_UNAVAILABLE") {
  try {
    return await client.send(command);
  } catch (error) {
    console.warn("Mechanic verification AWS failure", {
      operation: command.constructor.name,
      code: error.name,
      requestId: error.$metadata?.requestId,
      httpStatus: error.$metadata?.httpStatusCode,
      attempts: error.$metadata?.attempts
    });
    if (error.name === "CredentialsProviderError" || error.name === "ExpiredToken" || error.name === "ExpiredTokenException") {
      throw verificationError(503, "Mechanic verification is temporarily unavailable. Please try again shortly.", "VERIFICATION_CREDENTIALS_UNAVAILABLE");
    }
    const message = failureCode === "VERIFICATION_STORAGE_UNAVAILABLE"
      ? "Verification photo storage is temporarily unavailable. Please try again shortly."
      : "Face verification is temporarily unavailable. Please try again shortly.";
    throw verificationError(503, message, failureCode);
  }
}

function createMechanicVerificationService({
  rekognition, s3, bucket = process.env.MECHANIC_VERIFICATION_BUCKET, region
} = {}) {
  const config = createAwsClientConfig(region);
  rekognition ??= new RekognitionClient(config);
  s3 ??= new S3Client(config);

  async function detect(bytes) {
    const result = await send(rekognition, new DetectFacesCommand({ Image: { Bytes: bytes }, Attributes: ["DEFAULT"] }));
    return result.FaceDetails ?? [];
  }

  function bucketName() {
    if (!bucket) throw verificationError(503, "Verification photo storage is temporarily unavailable. Please try again shortly.", "VERIFICATION_STORAGE_UNAVAILABLE");
    return bucket;
  }

  async function deleteImages(images) {
    const results = await Promise.allSettled(images.map(image => send(s3, new DeleteObjectCommand({
      Bucket: bucketName(), Key: image.key, VersionId: image.versionId
    }), "VERIFICATION_STORAGE_UNAVAILABLE")));
    const failed = images.filter((image, index) => results[index].status === "rejected");
    if (failed.length) console.error("Mechanic verification image cleanup failed", failed);
    return failed;
  }

  async function submit({ submissionId, profilePhoto, cnicFront, cnicPortraitRegion, biometricConsent }) {
    if (biometricConsent !== true) throw verificationError(400, "Explicit biometric processing consent is required.");
    bucketName();
    const selectedRegion = cnicPortraitRegion === undefined ? null : portraitRegion(cnicPortraitRegion);
    const buffers = [];
    const images = {};
    try {
      const profile = await normalizeImage(profilePhoto, "Profile photo");
      buffers.push(profile.data);
      const cnic = await normalizeImage(cnicFront, "CNIC front");
      buffers.push(cnic.data);

      const profileFaces = await detect(profile.data);
      const cnicFaces = await detect(cnic.data);
      requireOneFace(profileFaces, "Profile photo");
      if (!cnicFaces.length || !selectedRegion) requireOneFace(cnicFaces, "CNIC front");

      const comparedRegion = selectedRegion || faceRegion(cnicFaces[0].BoundingBox);
      const portrait = await cropPortrait(cnic, comparedRegion);
      buffers.push(portrait);
      requireOneFace(await detect(portrait), "CNIC portrait crop");
      const comparison = await send(rekognition, new CompareFacesCommand({
        SourceImage: { Bytes: profile.data },
        TargetImage: { Bytes: portrait },
        SimilarityThreshold: 0
      }));
      const matches = comparison.FaceMatches ?? [];
      const score = matches.length ? matches[0].Similarity : null;
      if (matches.length && (!Number.isFinite(score) || score < 0 || score > 100)) {
        throw verificationError(503, "Face verification did not return a similarity score. Please retry.", "VERIFICATION_AI_UNAVAILABLE");
      }

      for (const [kind, image] of [["profile", profile], ["cnic", cnic]]) {
        const key = `mechanic-verification/${submissionId}/${kind}.jpg`;
        const uploaded = await send(s3, new PutObjectCommand({
          Bucket: bucket, Key: key, Body: image.data, ContentType: "image/jpeg",
          ServerSideEncryption: "AES256", IfNoneMatch: "*"
        }), "VERIFICATION_STORAGE_UNAVAILABLE");
        images[kind] = { key, ...(uploaded.VersionId ? { versionId: uploaded.VersionId } : {}) };
      }

      return { images, score, comparedRegion, matchStatus: score !== null && score >= REVIEW_THRESHOLD ? "matched" : "mismatch" };
    } catch (error) {
      await deleteImages(Object.values(images));
      throw error;
    } finally {
      for (const buffer of buffers) buffer.fill(0);
    }
  }

  function getImage(image) {
    return send(s3, new GetObjectCommand({ Bucket: bucketName(), Key: image.key, VersionId: image.versionId }), "VERIFICATION_STORAGE_UNAVAILABLE");
  }

  return { submit, deleteImages, getImage };
}

module.exports = { createMechanicVerificationService, CONSENT_VERSION, verificationError };
