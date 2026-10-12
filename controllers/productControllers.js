import Product from "../model/Product.js";

const parseStock = (value) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) return null;
  const stock = Number(value);
  return Number.isSafeInteger(stock) && stock >= 0 ? stock : null;
};

export const uploadProductImage = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Image is required" });
    if (!req.file.imageUrl) {
      return res.status(500).json({ message: "The image could not be stored." });
    }
    res.status(201).json({ image: req.file.imageUrl });
  } catch (error) {
    next(error);
  }
};

export const getProducts = async (req, res, next) => {
  try {
    const filter = { isActive: true };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.search) filter.name = { $regex: req.query.search, $options: "i" };

    const products = await Product.find(filter)
      .populate("category", "name")
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    next(error);
  }
};

export const getAdminProducts = async (req, res, next) => {
  try {
    const products = await Product.find()
      .populate("category", "name")
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    next(error);
  }
};

export const getProductById = async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isActive: true })
      .populate("category", "name");
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (error) {
    next(error);
  }
};

export const createProduct = async (req, res, next) => {
  try {
    const stock = parseStock(req.body.stock ?? 0);
    if (stock === null) {
      return res.status(400).json({ message: "Stock must be a non-negative whole number." });
    }
    const product = await Product.create({ ...req.body, stock });
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (req, res, next) => {
  try {
    const updates = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(updates, "stock")) {
      const stock = parseStock(updates.stock);
      if (stock === null) {
        return res.status(400).json({ message: "Stock must be a non-negative whole number." });
      }
      updates.stock = stock;
    }
    const product = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({
      message: "Product deleted successfully",
      productId: product._id,
    });
  } catch (error) {
    next(error);
  }
};
