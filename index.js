import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./config/Db.js";
import blogRoutes from "./routes/blogroutes.js";
import userRoutes from "./routes/userRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import { fileURLToPath } from "url";
import path from "path";

const app = express();
app.use("/uploads", express.static("uploads"))

dotenv.config();

app.use(express.json());
app.use(cors());

// Routes
app.use("/blogs", blogRoutes);
app.use("/users", userRoutes);
app.use("/products", productRoutes);
app.use("/orders", orderRoutes);
app.use("/categories", categoryRoutes);
app.use("/category", categoryRoutes);

// Test blog POST
app.post("/blog", (req, res) => {
  console.log(req.body);
  res.json(req.body);
});

// Home
app.get("/", (req, res) => {
  res.send("Hello World");
});

app.get("/unish", (req, res) => {
  res.send("Hello Unish");
});

app.get("/api", (req, res) => {
  res.send("this is api");
});

app.get("/jhantu", (req, res) => {
  res.send("Hello jhantu");
});

// Movies
app.post("/movies", (req, res) => {
  console.log(req.body);
  res.json(req.body);
});

app.get("/movies/:name", (req, res) => {
  console.log(req.params);
  res.send(`hello ${req.params.name}`);
});

app.get("/courses/:name", (req, res) => {
  console.log(req.params);
  res.send(`hello ${req.params.name}`);
});

app.use((error, req, res, next) => {
  console.error(error);
  const isClientError = ["ValidationError", "CastError"].includes(error.name);
  res.status(isClientError ? 400 : 500).json({
    message: isClientError ? error.message : "Server error",
  });
});

export default app;

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  connectDB().then(() => {
    app.listen(process.env.PORT || 8080, () => {
      console.log(`Server is running on http://localhost:${process.env.PORT || 8080}`);
    });
  });
}