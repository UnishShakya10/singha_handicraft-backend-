import mongoose from "mongoose";
import Product from "../model/Product.js";
import Order from "../model/Order.js";
import Counter from "../model/Counter.js";

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

const getNextInvoiceNumber = async () => {
  let counter;

  try {
    counter = await Counter.findByIdAndUpdate(
      "orderInvoice",
      { $inc: { sequence: 1 } },
      { new: true, upsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;

    counter = await Counter.findByIdAndUpdate(
      "orderInvoice",
      { $inc: { sequence: 1 } },
      { new: true }
    );
  }

  return `SH-${String(counter.sequence).padStart(4, "0")}`;
};

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
  const { status, paymentStatus } = req.body;
  const allowedStatuses = [
    "pending",
    "confirmed",
    "delivered",
    "cancelled",
    "placed",
    "processing",
    "shipped",
  ];
  const allowedPaymentStatuses = ["pending", "paid", "failed"];

  if (status === undefined && paymentStatus === undefined) {
    return res.status(400).json({ message: "Provide an order or payment status to update." });
  }
  if (status !== undefined && !allowedStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid order status" });
  }
  if (paymentStatus !== undefined && !allowedPaymentStatuses.includes(paymentStatus)) {
    return res.status(400).json({ message: "Invalid payment status" });
  }

  const session = await mongoose.startSession();
  try {
    let updatedOrder;
    await session.withTransaction(async () => {
      const order = await Order.findById(req.params.id).session(session);
      if (!order) throw httpError(404, "Order not found");
      if (order.status === "cancelled" && status && status !== "cancelled") {
        throw httpError(409, "A cancelled order cannot be reopened.");
      }

      const shouldRestoreStock =
        status === "cancelled" &&
        order.status !== "cancelled" &&
        order.inventoryStatus === "reserved";

      if (shouldRestoreStock) {
        const quantities = new Map();
        for (const item of order.items) {
          const productId = String(item.product);
          quantities.set(productId, (quantities.get(productId) || 0) + item.quantity);
        }
        for (const [productId, quantity] of quantities) {
          await Product.updateOne(
            { _id: productId },
            { $inc: { stock: quantity } },
            { session }
          );
        }
        order.inventoryStatus = "restored";
      }

      if (status !== undefined) order.status = status;
      if (paymentStatus !== undefined) order.paymentStatus = paymentStatus;
      await order.save({ session });
      updatedOrder = await Order.findById(order._id)
        .populate("user", "fullName email")
        .session(session);
    });
    res.json(updatedOrder);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  } finally {
    await session.endSession();
  }
};

export const createOrder = async (req, res, next) => {
  const { items, shippingAddress, paymentMethod = "cod", paymentReference = "" } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "At least one item is required" });
  }
  if (!shippingAddress || typeof shippingAddress !== "object") {
    return res.status(400).json({ message: "Shipping address is required" });
  }
  if (!["cod", "bank", "wallet"].includes(paymentMethod)) {
    return res.status(400).json({ message: "Invalid payment method" });
  }
  if (typeof paymentReference !== "string") {
    return res.status(400).json({ message: "Payment reference must be a string" });
  }
  if (
    shippingAddress.postalCode != null &&
    typeof shippingAddress.postalCode !== "string"
  ) {
    return res.status(400).json({ message: "Postal code must be a string" });
  }

  const quantities = new Map();
  for (const item of items) {
    const product = item?.product ?? item?.productId ?? item?._id ?? item?.id;
    const quantity = Number(item?.quantity ?? item?.qty);
    if (!mongoose.Types.ObjectId.isValid(product)) {
      return res.status(400).json({ message: "Each item must include a valid product ID" });
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      return res.status(400).json({ message: "Each item quantity must be a positive whole number" });
    }
    const productId = String(product);
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }

  if ([...quantities.values()].some((quantity) => !Number.isSafeInteger(quantity))) {
    return res.status(400).json({ message: "Requested product quantity is too large" });
  }

  const session = await mongoose.startSession();
  try {
    const invoiceNumber = await getNextInvoiceNumber();
    let createdOrder;
    await session.withTransaction(async () => {
      const products = await Product.find({
        _id: { $in: [...quantities.keys()] },
        isActive: true,
      }).session(session);
      const productMap = new Map(products.map((product) => [String(product._id), product]));
      const orderItems = [];

      for (const [productId, quantity] of quantities) {
        const product = productMap.get(productId);
        if (!product) throw httpError(400, "A product is unavailable.");

        const reservation = await Product.updateOne(
          { _id: product._id, isActive: true, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          { session }
        );
        if (reservation.matchedCount !== 1) {
          throw httpError(409, `${product.name} does not have enough stock available.`);
        }

        orderItems.push({
          product: product._id,
          name: product.name,
          price: product.price,
          quantity,
          image: product.images?.[0] || "",
        });
      }

      const subtotal = orderItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
      );
      [createdOrder] = await Order.create([{
        user: req.user.id,
        items: orderItems,
        shippingAddress,
        invoiceNumber,
        subtotal,
        totalAmount: subtotal,
        paymentMethod,
        paymentReference: paymentReference.trim(),
        paymentStatus: "pending",
        inventoryStatus: "reserved",
      }], { session });
    });
    res.status(201).json(createdOrder);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  } finally {
    await session.endSession();
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
    const isAdmin = String(req.user?.role || "").toLowerCase() === "admin";
    const query = isAdmin
      ? { _id: req.params.id }
      : { _id: req.params.id, user: req.user.id };
    const order = await Order.findOne(query).populate("user", "fullName email");
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (error) {
    next(error);
  }
};
