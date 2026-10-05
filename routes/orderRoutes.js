import express from "express";
import {
  createOrder,
  getAllOrders,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
} from "../controllers/orderControllers.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminMiddleware } from "../middleware/adminMiddleware.js";

const router = express.Router();

router.use(authMiddleware);
router.get("/admin", adminMiddleware, getAllOrders);
router.patch("/:id/status", adminMiddleware, updateOrderStatus);
router.post("/", createOrder);
router.get("/my", getMyOrders);
router.get("/:id", getOrderById);

export default router;
