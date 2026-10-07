import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import multer from "multer";
import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";

const bucketName = "uploads";
const fileExtensions = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const maximumImageSize = 10 * 1024 * 1024;

const getBucket = () => {
  if (!mongoose.connection.db) {
    throw new Error("The image database is not connected.");
  }
  return new GridFSBucket(mongoose.connection.db, { bucketName });
};

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maximumImageSize },
  fileFilter: (req, file, callback) => {
    if (!Object.hasOwn(fileExtensions, file.mimetype)) {
      return callback(new Error("Upload a JPEG, PNG, WebP, or GIF image."));
    }
    callback(null, true);
  },
});

export const persistUploadedImage = async (req, res, next) => {
  if (!req.file) return next();

  try {
    const bucket = getBucket();
    const extension = fileExtensions[req.file.mimetype];
    const filename = `${randomUUID()}${extension}`;
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: req.file.mimetype,
      metadata: { contentType: req.file.mimetype },
    });

    await new Promise((resolve, reject) => {
      uploadStream.once("error", reject);
      uploadStream.once("finish", resolve);
      Readable.from([req.file.buffer]).pipe(uploadStream);
    });

    req.file.imageUrl = `/uploads/${uploadStream.id.toString()}`;
    next();
  } catch (error) {
    next(error);
  }
};

export const getUploadedImage = async (req, res, next) => {
  if (!ObjectId.isValid(req.params.id) || req.params.id.length !== 24) {
    return res.status(404).json({ message: "Image not found." });
  }

  try {
    const bucket = getBucket();
    const [file] = await bucket
      .find({ _id: new ObjectId(req.params.id) })
      .limit(1)
      .toArray();

    if (!file) return res.status(404).json({ message: "Image not found." });

    res.set({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(file.length),
      "Content-Type": file.metadata?.contentType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });

    const downloadStream = bucket.openDownloadStream(file._id);
    downloadStream.once("error", next);
    downloadStream.pipe(res);
  } catch (error) {
    next(error);
  }
};
