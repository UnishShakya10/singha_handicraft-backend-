import "dotenv/config";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
};
const configuredValues = Object.values(cloudinaryConfig).filter(Boolean).length;

if (configuredValues > 0 && configuredValues < 3) {
  throw new Error(
    "Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET together."
  );
}

export const cloudinaryConfigured = configuredValues === 3;

if (cloudinaryConfigured) {
  cloudinary.config({ ...cloudinaryConfig, secure: true });
}

const storage = cloudinaryConfigured
  ? new CloudinaryStorage({
      cloudinary,
      params: {
        folder: "singha-handicraft",
        allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
        resource_type: "image",
      },
    })
  : undefined;

export const imageUpload = storage
  ? multer({ storage })
  : multer({ dest: "uploads/" });

export const requireImageStorage = (req, res, next) => {
  if (process.env.NODE_ENV === "production" && !cloudinaryConfigured) {
    return res.status(503).json({
      message: "Image uploads are unavailable until Cloudinary is configured.",
    });
  }
  next();
};

export const setUploadedImageUrl = (req, res, next) => {
  if (req.file) {
    req.file.imageUrl = cloudinaryConfigured
      ? req.file.path
      : `/uploads/${req.file.filename}`;
  }
  next();
};
