import Product from "../model/Product.js";
import Order from "../model/Order.js";

export const getAllOrders = async (req, res, next) => {
  try {
    const orders = await Order.find()
      .populate("user", "fullName email")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    next(error);
  }
};

export const updateOrderStatus = async (req, res, next) => {
  try {
    const allowedStatuses = ["placed", "processing", "shipped", "delivered", "cancelled"];
    if (!allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({ message: "Invalid order status" });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true, runValidators: true }
    ).populate("user", "fullName email");

    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (error) {
    next(error);
  }
};

export const createOrder = async (req, res, next) => {
  try {
    const { items, shippingAddress, paymentMethod = "cod" } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "At least one item is required" });
    }
    if (!shippingAddress || typeof shippingAddress !== "object") {
      return res.status(400).json({ message: "Shipping address is required" });
    }

    const normalizedItems = items.map((item) => ({
      product: item.product ?? item.productId ?? item._id ?? item.id,
      quantity: item.quantity ?? item.qty,
    }));
    if (normalizedItems.some((item) => !item.product)) {
      return res.status(400).json({ message: "Each item must include a product ID" });
    }

    const products = await Product.find({
      _id: { $in: normalizedItems.map((item) => item.product) },
      isActive: true,
    });
    const productMap = new Map(products.map((product) => [product.id, product]));
    const orderItems = [];

    for (const item of normalizedItems) {
      const product = productMap.get(String(item.product));
      const quantity = Number(item.quantity);
      if (!product || !Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ message: "Invalid product or quantity" });
      }
      if (product.stock < quantity) {
        return res.status(409).json({ message: `${product.name} is out of stock` });
      }
      orderItems.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity,
        image: product.images[0],
      });
    }

    const totalAmount = orderItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );

    for (const item of orderItems) {
      await Product.updateOne(
        { _id: item.product, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } }
      );
    }

    const order = await Order.create({
      user: req.user.id,
      items: orderItems,
      shippingAddress,
      totalAmount,
      paymentMethod,
    });
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
};

export const getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    next(error);
  }
};

export const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user.id });
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (error) {
    next(error);
  }
};
