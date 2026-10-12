import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    image: String,
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: (items) => items.length > 0,
    },
    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, default: "" },
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["cod","bank","wallet"],
      default: "cod",
    },

     // Transaction reference for bank or wallet payments
    paymentReference: {
      type: String,
      default: "",
      trim: true,
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },

    inventoryStatus: {
      type: String,
      enum: ["not_reserved", "reserved", "restored"],
      default: "not_reserved",
    },

    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "delivered",
        "cancelled",
        "placed",
        "processing",
        "shipped",
      ],
      default: "pending",
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);
export default Order;
