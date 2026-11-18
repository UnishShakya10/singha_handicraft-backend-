import PDFDocument from "pdfkit";

const paymentLabels = {
  cod: "Cash on delivery",
  bank: "Bank transfer",
  wallet: "Digital wallet",
};

const money = (amount) =>
  `NPR ${Number(amount || 0).toLocaleString("en-US")}`;

const safeText = (value) => String(value ?? "").replace(/\r?\n/g, " ");

export const createInvoicePdf = (order, user) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const invoiceNumber = order.invoiceNumber || String(order._id);
    const address = order.shippingAddress || {};
    const orderDate = order.createdAt
      ? new Date(order.createdAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";

    doc
      .fillColor("#c9a227")
      .fontSize(10)
      .text("SINGHA HANDICRAFT", 50, 50);

    doc
      .fillColor("#14110d")
      .fontSize(24)
      .text("INVOICE", 50, 78);

    doc
      .fillColor("#555555")
      .fontSize(11)
      .text(`Invoice: ${invoiceNumber}`, 50, 112)
      .text(`Date: ${orderDate}`, 50, 128)
      .text(`Status: ${safeText(order.status || "pending")}`, 50, 144);

    doc
      .fontSize(12)
      .fillColor("#14110d")
      .text("Billed to", 350, 112)
      .fontSize(10)
      .fillColor("#555555")
      .text(safeText(address.fullName || user?.fullName || "Customer"), 350, 128)
      .text(safeText(address.address || ""), 350, 143)
      .text(
        safeText(
          [address.city, address.state, address.postalCode]
            .filter(Boolean)
            .join(", ")
        ),
        350,
        158
      )
      .text(safeText(address.phone || ""), 350, 173);

    const tableTop = 210;
    doc
      .fillColor("#14110d")
      .rect(50, tableTop - 8, 495, 24)
      .fill();

    doc
      .fillColor("#ffffff")
      .fontSize(10)
      .text("Item", 58, tableTop)
      .text("Qty", 330, tableTop)
      .text("Price", 390, tableTop)
      .text("Amount", 470, tableTop);

    let y = tableTop + 30;

    for (const item of order.items || []) {
      if (y > 700) {
        doc.addPage();
        y = 60;
      }

      const amount = Number(item.price || 0) * Number(item.quantity || 0);

      doc
        .fillColor("#14110d")
        .fontSize(10)
        .text(safeText(item.name || "Product"), 58, y, { width: 260 })
        .text(safeText(item.finish || "Gold"), 58, y + 13, {
          width: 260,
          color: "#777777",
        })
        .text(String(item.quantity || 0), 330, y)
        .text(money(item.price), 390, y, { width: 70 })
        .text(money(amount), 470, y, { width: 75, align: "right" });

      y += 48;
      doc
        .strokeColor("#eeeeee")
        .moveTo(50, y - 8)
        .lineTo(545, y - 8)
        .stroke();
    }

    y = Math.max(y + 12, 560);
    doc
      .fillColor("#14110d")
      .fontSize(11)
      .text("Subtotal", 390, y)
      .text(money(order.subtotal), 470, y, { width: 75, align: "right" })
      .text("Total", 390, y + 24)
      .text(money(order.totalAmount), 470, y + 24, {
        width: 75,
        align: "right",
      });

    doc
      .fontSize(10)
      .fillColor("#555555")
      .text(
        `Payment: ${
          paymentLabels[order.paymentMethod] ||
          order.paymentMethod ||
          "Not specified"
        }`,
        50,
        y
      )
      .text(`Payment status: ${safeText(order.paymentStatus || "pending")}`, 50, y + 16);

    doc
      .fillColor("#999999")
      .fontSize(9)
      .text("Thank you for choosing Singha Handicraft.", 50, 760, {
        align: "center",
        width: 495,
      });

    doc.end();
  });
