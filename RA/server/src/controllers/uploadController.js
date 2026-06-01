import fs from "fs/promises";
import { v2 as cloudinary } from "cloudinary";

function hasCloudinaryConfig() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

async function removeLocalFile(path) {
  try {
    await fs.unlink(path);
  } catch (_error) {
    // Best-effort cleanup only.
  }
}

export async function uploadImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: "Image file is required" });
  }

  if (hasCloudinaryConfig()) {
    try {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });

