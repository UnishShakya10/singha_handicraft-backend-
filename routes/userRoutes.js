import express from "express"

import {
  createUser,
  deleteUser,
  getMe,
  getUserById,
  getUsers,
  login,
  updateUser
} from "../controllers/userControllers.js"
import { authMiddleware } from "../middleware/authMiddleware.js"
import { adminMiddleware } from "../middleware/adminMiddleware.js"
import {
  imageUpload,
  persistUploadedImage,
} from "../config/imageUpload.js"

const router = express.Router()

router.post(
  "/create",
  imageUpload.single("avatar"),
  persistUploadedImage,
  createUser
)

router.post("/login", login)
router.get("/me", authMiddleware, getMe)
router.get("/getAll", authMiddleware, adminMiddleware, getUsers)
router.get("/getById/:id", authMiddleware, getUserById)
router.delete("/delete/:id", authMiddleware, adminMiddleware, deleteUser)
router.put("/update/:id", authMiddleware, updateUser)

export default router