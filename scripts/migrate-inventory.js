import "dotenv/config";
import mongoose from "mongoose";
import Order from "../model/Order.js";
import Product from "../model/Product.js";

const run = async () => {
  if (!process.env.DB_URL) {
    throw new Error("DB_URL is required to run the inventory migration.");
  }

  await mongoose.connect(process.env.DB_URL);

  const products = await Product.updateMany(
    { $or: [{ stock: { $exists: false } }, { stock: null }] },
    { $set: { stock: 0 } }
  );

  await Order.updateMany(
    { inventoryStatus: { $exists: false }, status: { $ne: "cancelled" } },
    { $set: { inventoryStatus: "reserved" } }
  );

  const cancelledOrders = await Order.find({
    inventoryStatus: { $exists: false },
    status: "cancelled",
  }).select("_id items");

  let restoredOrders = 0;
  for (const candidate of cancelledOrders) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const order = await Order.findOne({
          _id: candidate._id,
          inventoryStatus: { $exists: false },
          status: "cancelled",
        }).session(session);
        if (!order) return;

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
        await order.save({ session });
        restoredOrders += 1;
      });
    } finally {
      await session.endSession();
    }
  }

  console.log(
    `Inventory migration complete: ${products.modifiedCount} product stocks initialized; ${restoredOrders} cancelled orders restored.`
  );
};

run()
  .catch((error) => {
    console.error("Inventory migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
