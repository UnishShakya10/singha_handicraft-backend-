import express from "express";
import {
  createProduct,
  deleteProduct,
  getAdminProducts,
  getProductById,
  getProducts,
  updateProduct,
  uploadProductImage,
} from "../controllers/productControllers.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminMiddleware } from "../middleware/adminMiddleware.js";
import { imageUpload, persistUploadedImage } from "../config/imageUpload.js";

const router = express.Router();

router.get("/", getProducts);
router.get("/admin", authMiddleware, adminMiddleware, getAdminProducts);
router.get("/:id", getProductById);
router.post("/", authMiddleware, adminMiddleware, createProduct);
router.post(
  "/upload-image",
  authMiddleware,
  adminMiddleware,
  imageUpload.single("image"),
  persistUploadedImage,
  uploadProductImage
);
router.put("/:id", authMiddleware, adminMiddleware, updateProduct);
router.delete("/:id", authMiddleware, adminMiddleware, deleteProduct);

export default router;
