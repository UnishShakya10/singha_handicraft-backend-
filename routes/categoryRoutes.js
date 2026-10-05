import express from "express";
import {
  createCategory,
  deleteCategory,
  getCategories,
  getCategoryById,
  updateCategory,
} from "../controllers/categoryControllers.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminMiddleware } from "../middleware/adminMiddleware.js";

const router = express.Router();

router.get("/", getCategories);
router.get("/getById/:id", getCategoryById);
router.get("/:id", getCategoryById);
router.post("/", authMiddleware, adminMiddleware, createCategory);
router.post("/create", authMiddleware, adminMiddleware, createCategory);
router.put("/update/:id", authMiddleware, adminMiddleware, updateCategory);
router.put("/:id", authMiddleware, adminMiddleware, updateCategory);
router.delete("/delete/:id", authMiddleware, adminMiddleware, deleteCategory);
router.delete("/:id", authMiddleware, adminMiddleware, deleteCategory);

export default router;