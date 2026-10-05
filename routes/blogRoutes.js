import express from "express"
import { createBlog, deleteBlog, getBlogById, getBlogs, updateBlog } from "../controllers/blogControllers.js"
import { authMiddleware } from "../middleware/authMiddleware.js"
import { adminMiddleware } from "../middleware/adminMiddleware.js"

const router = express.Router()

router.post("/create",authMiddleware,adminMiddleware,createBlog)

router.get("/getAll",getBlogs)

router.get("/getById/:id",getBlogById)

router.delete("/delete/:id",authMiddleware,adminMiddleware,deleteBlog)

router.put("/update/:id",authMiddleware,adminMiddleware,updateBlog)


export default router