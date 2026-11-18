
import mongoose from "mongoose";
import Product from "../model/Product.js";
import Order from "../model/Order.js";
import Counter from "../model/Counter.js";
import User from "../model/User.js";
import { sendOrderEmails } from "../utils/sendEmail.js";
import { createInvoicePdf } from "../utils/invoicePdf.js";

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

// Restore stock to the correct product or variant.
const restoreOrderInventory = async (order, session) => {
  const quantities = new Map();

  for (const item of order.items) {
    const productId = String(item.product);
    const variantId = item.variantId
      ? String(item.variantId)
      : "";

    const key = `${productId}:${variantId}`;

    quantities.set(
      key,
      (quantities.get(key) || 0) + item.quantity
    );
  }

  for (const [key, quantity] of quantities) {
    const [productId, variantId] = key.split(":");

    if (variantId) {
      await Product.updateOne(
        {
          _id: productId,
          variants: {
            $elemMatch: {
              _id: variantId,
            },
          },
        },
        {
          $inc: {
            "variants.$.stock": quantity,
          },
        },
        { session }
      );
    } else {
      await Product.updateOne(
        { _id: productId },
        {
          $inc: { stock: quantity },
        },
        { session }
      );
    }
  }
};

// GET ALL ORDERS
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

// UPDATE ORDER AND PAYMENT STATUS
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
    return res.status(400).json({
      message: "Provide an order or payment status to update.",
    });
  }

  if (status !== undefined && !allowedStatuses.includes(status)) {
    return res.status(400).json({
      message: "Invalid order status",
    });
  }

  if (
    paymentStatus !== undefined &&
    !allowedPaymentStatuses.includes(paymentStatus)
  ) {
    return res.status(400).json({
      message: "Invalid payment status",
    });
  }

  const session = await mongoose.startSession();

  try {
    let updatedOrder;

    await session.withTransaction(async () => {
      const order = await Order.findById(req.params.id).session(session);

      if (!order) {
        throw httpError(404, "Order not found");
      }

      if (order.status === "cancelled" && status && status !== "cancelled") {
        throw httpError(409, "A cancelled order cannot be reopened.");
      }

      const shouldRestoreStock =
        status === "cancelled" &&
        order.status !== "cancelled" &&
        order.inventoryStatus === "reserved";

      if (shouldRestoreStock) {
        await restoreOrderInventory(order, session);
        order.inventoryStatus = "restored";
      }

      if (status !== undefined) {
        order.status = status;
      }

      if (paymentStatus !== undefined) {
        order.paymentStatus = paymentStatus;
      }

      await order.save({ session });

      updatedOrder = await Order.findById(order._id)
        .populate("user", "fullName email")
        .session(session);
    });

    res.json(updatedOrder);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};

// CREATE ORDER
export const createOrder = async (req, res, next) => {
  const {
    items,
    shippingAddress,
    paymentMethod = "cod",
    paymentReference = "",
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      message: "At least one item is required",
    });
  }

  if (!shippingAddress || typeof shippingAddress !== "object") {
    return res.status(400).json({
      message: "Shipping address is required",
    });
  }

  if (!["cod", "bank", "wallet"].includes(paymentMethod)) {
    return res.status(400).json({
      message: "Invalid payment method",
    });
  }

  if (typeof paymentReference !== "string") {
    return res.status(400).json({
      message: "Payment reference must be a string",
    });
  }

  if (
    shippingAddress.postalCode != null &&
    typeof shippingAddress.postalCode !== "string"
  ) {
    return res.status(400).json({
      message: "Postal code must be a string",
    });
  }

  // Group by product AND variant so different finishes
  // are reserved independently.
  const requestedItems = new Map();

  for (const item of items) {
    const productId =
      item?.product ?? item?.productId ?? item?._id ?? item?.id;

    const variantId = item?.variantId || null;
    const quantity = Number(item?.quantity ?? item?.qty);

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        message: "Each item must include a valid product ID",
      });
    }

    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      return res.status(400).json({
        message: "Each item quantity must be a positive whole number",
      });
    }

    if (
      variantId &&
      !mongoose.Types.ObjectId.isValid(variantId)
    ) {
      return res.status(400).json({
        message: "Invalid product variant",
      });
    }

    const normalizedProductId = String(productId);
    const normalizedVariantId = variantId
      ? String(variantId)
      : "";

    const key = `${normalizedProductId}:${normalizedVariantId}`;

    const existing = requestedItems.get(key);

    const newQuantity = (existing?.quantity || 0) + quantity;

    if (!Number.isSafeInteger(newQuantity)) {
      return res.status(400).json({
        message: "Requested product quantity is too large",
      });
    }

    requestedItems.set(key, {
      productId: normalizedProductId,
      variantId: normalizedVariantId || null,
      quantity: newQuantity,
    });
  }

  const session = await mongoose.startSession();

  try {
    const invoiceNumber = await getNextInvoiceNumber();

    let createdOrder;

    await session.withTransaction(async () => {
      const productIds = [
        ...new Set(
          [...requestedItems.values()].map(
            (item) => item.productId
          )
        ),
      ];

      const products = await Product.find({
        _id: { $in: productIds },
        isActive: true,
      }).session(session);

      const productMap = new Map(
        products.map((product) => [
          String(product._id),
          product,
        ])
      );

      const orderItems = [];

      for (const requested of requestedItems.values()) {
        const { productId, variantId, quantity } = requested;

        const product = productMap.get(productId);

        if (!product) {
          throw httpError(400, "A product is unavailable.");
        }

        let price;
        let image;
        let finish = "Gold";

        // SELECTED VARIANT: Silver, Antique, etc.
        if (variantId) {
          const variant = product.variants.id(variantId);

          if (!variant || variant.isActive === false) {
            throw httpError(
              400,
              `The selected finish for ${product.name} is unavailable.`
            );
          }

          if (Number(variant.stock) < quantity) {
            throw httpError(
              409,
              `Only ${variant.stock} of ${product.name} (${variant.finish}) are available.`
            );
          }

          const reservation = await Product.updateOne(
            {
              _id: product._id,
              isActive: true,
              variants: {
                $elemMatch: {
                  _id: variant._id,
                  isActive: { $ne: false },
                  stock: { $gte: quantity },
                },
              },
            },
            {
              $inc: {
                "variants.$.stock": -quantity,
              },
            },
            { session }
          );

          if (reservation.matchedCount !== 1) {
            throw httpError(
              409,
              `${product.name} (${variant.finish}) does not have enough stock available.`
            );
          }

          price = Number(variant.price);
          finish = variant.finish;

          // Use the selected variant image first.
          image =
            variant.images?.[0] ||
            product.images?.[0] ||
            "";
        } else {
          // DEFAULT PRODUCT: Gold
          if (Number(product.stock) < quantity) {
            throw httpError(
              409,
              `${product.name} does not have enough stock available.`
            );
          }

          const reservation = await Product.updateOne(
            {
              _id: product._id,
              isActive: true,
              stock: { $gte: quantity },
            },
            {
              $inc: { stock: -quantity },
            },
            { session }
          );

          if (reservation.matchedCount !== 1) {
            throw httpError(
              409,
              `${product.name} does not have enough stock available.`
            );
          }

          price = Number(product.price);
          image = product.images?.[0] || "";
        }

        orderItems.push({
          product: product._id,
          variantId: variantId || null,
          name: product.name,
          finish,
          price,
          quantity,
          image,
        });
      }

      const subtotal = orderItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
      );

      [createdOrder] = await Order.create(
        [
          {
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
          },
        ],
        { session }
      );
    });

    // Respond after successful order creation.
    res.status(201).json(createdOrder);

    // Email failures must not interrupt the order.
    User.findById(req.user.id)
      .select("fullName email")
      .then((user) => sendOrderEmails(createdOrder, user))
      .catch((err) =>
        console.error("Order email failed:", err.message)
      );
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};

// GET LOGGED-IN USER'S ORDERS
export const getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({
      user: req.user.id,
    }).sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    next(error);
  }
};

// GET SINGLE ORDER
export const getOrderById = async (req, res, next) => {
  try {
    const isAdmin =
      String(req.user?.role || "").toLowerCase() === "admin";

    const query = isAdmin
      ? { _id: req.params.id }
      : {
          _id: req.params.id,
          user: req.user.id,
        };

    const order = await Order.findOne(query)
      .populate("user", "fullName email");

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    res.json(order);
  } catch (error) {
    next(error);
  }
};

// GET ORDER INVOICE PDF
export const getOrderInvoicePdf = async (req, res, next) => {
  try {
    const isAdmin =
      String(req.user?.role || "").toLowerCase() === "admin";

    const order = await Order.findById(req.params.id).populate(
      "user",
      "fullName email"
    );

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const orderUserId = String(order.user?._id || order.user);
    if (!isAdmin && orderUserId !== String(req.user.id)) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const pdf = await createInvoicePdf(order, order.user);
    const invoiceNumber = String(order.invoiceNumber || order._id);
    const disposition = req.query.download === "true" ? "attachment" : "inline";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="invoice-${invoiceNumber}.pdf"`
    );
    res.setHeader("Content-Length", pdf.length);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
};

// DELETE ORDER
export const deleteOrder = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const order = await Order.findById(req.params.id).session(session);

      if (!order) {
        throw httpError(404, "Order not found");
      }

      const shouldRestoreStock =
        order.inventoryStatus === "reserved" &&
        order.status !== "delivered";

      if (shouldRestoreStock) {
        await restoreOrderInventory(order, session);
      }

      await Order.deleteOne({ _id: order._id }).session(session);
    });

    res.json({
      message: "Order deleted",
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};

// CANCEL CUSTOMER ORDER
export const cancelMyOrder = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    let cancelledOrder;

    await session.withTransaction(async () => {
      const order = await Order.findOne({
        _id: req.params.id,
        user: req.user.id,
      }).session(session);

      if (!order) {
        throw httpError(404, "Order not found");
      }

      const isPending = ["pending", "placed"].includes(order.status);

      if (!isPending) {
        throw httpError(
          409,
          "Only pending orders can be cancelled."
        );
      }

      if (order.inventoryStatus === "reserved") {
        await restoreOrderInventory(order, session);
        order.inventoryStatus = "restored";
      }

      order.status = "cancelled";

      await order.save({ session });

      cancelledOrder = order;
    });

    res.json(cancelledOrder);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};
