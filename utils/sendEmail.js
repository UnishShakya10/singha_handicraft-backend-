
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";

// ==========================================
// 1. GMAIL SMTP TRANSPORTER
// ==========================================

const createTransporter = () => {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS.replace(/\s+/g, ""),
    },
  });
};

const PAYMENT_LABELS = {
  cod: "Cash on delivery",
  bank: "Bank transfer",
  wallet: "Digital wallet",
};

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const money = (amount) =>
  `NPR ${Number(amount || 0).toLocaleString("en-US")}`;

// ==========================================
// 3. PDF INVOICE
// ==========================================

const buildInvoicePdf = async (order, user) => {
  const chunks = [];
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    info: {
      Title: `Invoice ${order.invoiceNumber || order._id}`,
      Author: "Singha Handicraft",
      Subject: "Order invoice",
    },
  });

  const pdfBuffer = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const invoiceNumber = order.invoiceNumber || order._id;
  const address = order.shippingAddress || {};
  const orderDate = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
  const payment =
    PAYMENT_LABELS[order.paymentMethod] ||
    order.paymentMethod ||
    "Not specified";

  doc
    .fillColor("#14110d")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text("SINGHA HANDICRAFT", 50, 50);

  doc
    .fillColor("#777777")
    .font("Helvetica")
    .fontSize(10)
    .text("INVOICE", 50, 78)
    .text(`Invoice: ${invoiceNumber}`, 50, 94)
    .text(`Date: ${orderDate}`, 50, 108);

  doc
    .fillColor("#14110d")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("BILL TO", 50, 145);

  doc
    .fillColor("#333333")
    .font("Helvetica")
    .fontSize(10)
    .text(address.fullName || user?.fullName || user?.name || "Customer", 50, 162)
    .text(address.address || "", 50, 177)
    .text(
      [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
      50,
      192
    )
    .text(address.phone || "", 50, 207);

  const tableTop = 250;
  doc
    .fillColor("#c9a227")
    .rect(50, tableTop - 8, 495, 28)
    .fill();

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("ITEM", 60, tableTop)
    .text("QTY", 360, tableTop)
    .text("PRICE", 405, tableTop)
    .text("AMOUNT", 475, tableTop);

  let y = tableTop + 32;

  for (const item of order.items || []) {
    if (y > 700) {
      doc.addPage();
      y = 50;
    }

    const lineAmount =
      Number(item.price || 0) * Number(item.quantity || 0);
    const name = item.name || "Product";
    const finish = item.finish ? `Finish: ${item.finish}` : "";

    doc
      .fillColor("#14110d")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(name, 60, y, { width: 290 });

    if (finish) {
      doc
        .fillColor("#777777")
        .font("Helvetica")
        .fontSize(8)
        .text(finish, 60, y + 14);
    }

    doc
      .fillColor("#333333")
      .font("Helvetica")
      .fontSize(9)
      .text(String(item.quantity || 0), 360, y)
      .text(money(item.price), 405, y, { width: 60, align: "right" })
      .text(money(lineAmount), 475, y, { width: 70, align: "right" });

    doc
      .strokeColor("#eeeeee")
      .lineWidth(1)
      .moveTo(50, y + 34)
      .lineTo(545, y + 34)
      .stroke();

    y += 48;
  }

  if (y > 690) {
    doc.addPage();
    y = 50;
  }

  doc
    .fillColor("#14110d")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("TOTAL", 405, y)
    .text(money(order.totalAmount), 475, y, { width: 70, align: "right" });

  doc
    .fillColor("#777777")
    .font("Helvetica")
    .fontSize(9)
    .text(`Payment method: ${payment}`, 50, y + 28)
    .text(`Payment status: ${order.paymentStatus || "pending"}`, 50, y + 43);

  doc
    .fillColor("#777777")
    .fontSize(8)
    .text("Thank you for shopping with Singha Handicraft.", 50, 760, {
      width: 495,
      align: "center",
    });

  doc.end();
  return pdfBuffer;
};

// Get product image from the order item.
const getProductImage = (item) => {
  const image =
    item?.image ||
    item?.productImage ||
    item?.imageUrl ||
    item?.images?.[0] ||
    "";

  if (typeof image === "string") {
    return image;
  }

  if (image && typeof image === "object") {
    return (
      image.url ||
      image.imageUrl ||
      image.secure_url ||
      ""
    );
  }

  return "";
};

// Convert relative image paths into publicly accessible HTTPS URLs.
const absoluteImage = (value) => {
  if (!value) return "";

  const base = (process.env.BACKEND_URL || "").replace(/\/+$/, "");

  let url = String(value).trim();

  if (!url) return "";

  // Protocol-relative URL.
  if (url.startsWith("//")) {
    url = `https:${url}`;
  }
  // Relative URL beginning with /.
  else if (url.startsWith("/")) {
    if (!base) return "";
    url = `${base}${url}`;
  }
  // Relative path without /.
  else if (!/^https?:\/\//i.test(url)) {
    if (!base) return "";
    url = `${base}/${url.replace(/^\/+/, "")}`;
  }

  // Do not use local development URLs in emails.
  if (/^https?:\/\/(localhost|127(?:\.\d{1,3}){3})(:\d+)?/i.test(url)) {
    return "";
  }

  // Upgrade HTTP URLs to HTTPS.
  return url.replace(/^http:\/\//i, "https://");
};

const buildEmailImageAssets = async (order) => {
  const sources = [];
  const attachments = [];

  for (const [index, item] of (order.items || []).entries()) {
    const imageUrl = absoluteImage(getProductImage(item));
    if (!imageUrl) continue;

    try {
      const response = await fetch(imageUrl, {
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`Image fetch failed: ${response.status}`);
      }

      const contentType =
        response.headers.get("content-type") || "image/jpeg";

      if (!contentType.startsWith("image/")) continue;

      const cid = `product-${index}@singha-handicraft`;
      sources[index] = `cid:${cid}`;
      attachments.push({
        filename: `product-${index + 1}.${contentType.includes("png")
          ? "png"
          : contentType.includes("webp")
            ? "webp"
            : "jpg"}`,
        content: Buffer.from(await response.arrayBuffer()),
        contentType,
        cid,
      });
    } catch (error) {
      sources[index] = imageUrl;
      console.warn(`Could not embed product image ${index + 1}:`, error.message);
    }
  }

  return { sources, attachments };
};

// ==========================================
// 3. ORDER EMAIL HTML
// ==========================================

const buildHtml = (
  order,
  user,
  { heading, intro, showCustomer, imageSources = [] }
) => {
  const address = order.shippingAddress || {};

  const rows = (order.items || [])
    .map((item, index) => {
      const image = imageSources[index] || absoluteImage(getProductImage(item));

      const finish = item.finish || "Gold";

      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #eee;width:80px;">
            ${
              image
                ? `
                  <img
                    src="${esc(image)}"
                    alt="${esc(item.name || "Product")}"
                    width="64"
                    height="64"
                    style="display:block;width:64px;height:64px;border-radius:6px;object-fit:cover;background:#f1ede2;"
                  />
                `
                : `
                  <div style="width:64px;height:64px;background:#f1ede2;border-radius:6px;text-align:center;line-height:64px;font-size:11px;color:#999;">
                    No image
                  </div>
                `
            }
          </td>

          <td style="padding:12px 8px;border-bottom:1px solid #eee;font-size:14px;color:#14110d;">
            <strong>${esc(item.name || "Product")}</strong>

            <br />

            <span style="color:#777;font-size:12px;">
              Finish: ${esc(finish)}
            </span>

            <br />

            <span style="color:#777;font-size:12px;">
              Qty ${esc(item.quantity)} × ${money(item.price)}
            </span>
          </td>

          <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;font-size:14px;color:#14110d;">
            ${money(
              Number(item.price || 0) *
              Number(item.quantity || 0)
            )}
          </td>
        </tr>
      `;
    })
    .join("");

  const addressLines = [
    address.fullName,
    address.address,
    [address.city, address.state, address.postalCode]
      .filter(Boolean)
      .join(", "),
    address.phone,
  ]
    .filter(Boolean)
    .map(esc)
    .join("<br />");

  const payment =
    PAYMENT_LABELS[order.paymentMethod] ||
    order.paymentMethod ||
    "Not specified";

  const orderDate = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  return `
    <div style="background:#f7f3ea;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border-top:3px solid #c9a227;padding:28px;">

        <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#c9a227;">
          Singha Handicraft
        </p>

        <h1 style="margin:8px 0 4px;font-size:22px;color:#14110d;">
          ${esc(heading)}
        </h1>

        <p style="margin:0 0 20px;font-size:14px;color:#555;">
          ${esc(intro)}
        </p>

        <p style="margin:0 0 4px;font-size:13px;color:#777;">
          Order
          <strong style="color:#14110d;">
            ${esc(order.invoiceNumber || order._id)}
          </strong>
          · ${esc(orderDate)}
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-collapse:collapse;">
          ${rows || `<tr><td>No order items found.</td></tr>`}
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
          <tr>
            <td style="font-size:14px;color:#777;">
              Total
            </td>

            <td style="text-align:right;font-size:18px;font-weight:bold;color:#14110d;">
              ${money(order.totalAmount)}
            </td>
          </tr>

          <tr>
            <td style="padding-top:6px;font-size:13px;color:#777;">
              Payment
            </td>

            <td style="padding-top:6px;text-align:right;font-size:13px;color:#14110d;">
              ${esc(payment)}
            </td>
          </tr>
        </table>

        <p style="margin:24px 0 6px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#777;">
          Delivery details
        </p>

        <p style="margin:0;font-size:14px;line-height:1.6;color:#14110d;">
          ${addressLines || "Delivery address not available"}
        </p>

        ${
          showCustomer
            ? `
              <p style="margin:16px 0 0;font-size:13px;color:#555;">
                Customer: ${esc(user?.fullName || user?.name || "Customer")}
                · ${esc(user?.email || "")}
              </p>
            `
            : ""
        }

      </div>
    </div>
  `;
};

// ==========================================
// 4. ORDER CONFIRMATION + ADMIN NOTIFICATION
// ==========================================

export const sendOrderEmails = async (order, user) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("Gmail credentials are missing. Skipping order emails.");
    return;
  }

  try {
    const transporter = createTransporter();

    const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    const jobs = [];
    const { sources: imageSources, attachments: imageAttachments } =
      await buildEmailImageAssets(order);

    // Customer order confirmation.
    if (user?.email) {
      const invoicePdf = await buildInvoicePdf(order, user);
      const safeInvoiceNumber =
        String(order.invoiceNumber || order._id)
          .replace(/[^a-zA-Z0-9_-]+/g, "-");

      jobs.push(
        transporter.sendMail({
          from,
          to: user.email,
          subject: `Your order ${order.invoiceNumber || order._id} is confirmed`,
          html: buildHtml(order, user, {
            heading: "Thank you for your order",
            intro: "We've received your order and will confirm it shortly.",
            showCustomer: false,
            imageSources,
          }),
          attachments: [
            {
              filename: `Invoice-${safeInvoiceNumber}.pdf`,
              content: invoicePdf,
              contentType: "application/pdf",
            },
            ...imageAttachments,
          ],
        })
      );
    } else {
      console.warn("Customer email is missing. Customer confirmation skipped.");
    }

    // Admin order notification.
    if (process.env.SHOP_EMAIL) {
      jobs.push(
        transporter.sendMail({
          from,
          to: process.env.SHOP_EMAIL,
          subject: `New order ${order.invoiceNumber || order._id}`,
          html: buildHtml(order, user, {
            heading: "New order received",
            intro: "A customer just placed an order.",
            showCustomer: true,
            imageSources,
          }),
          attachments: imageAttachments,
        })
      );
    }

    const results = await Promise.allSettled(jobs);

    results.forEach((result) => {
      if (result.status === "rejected") {
        console.error("Order email failed:", result.reason?.message);
      } else {
        console.log("Order email sent:", result.value.messageId);
      }
    });
  } catch (error) {
    console.error("Order email service failed:", error.message);
  }
};

const ORDER_STATUS_EMAILS = {
  confirmed: {
    subject: "is confirmed",
    heading: "Your order is confirmed",
    intro: "Our team has confirmed your order and is preparing it.",
  },
  delivered: {
    subject: "has been delivered",
    heading: "Your order has been delivered",
    intro: "Your order has been marked as delivered. We hope you enjoy it.",
  },
  cancelled: {
    subject: "has been cancelled",
    heading: "Your order has been cancelled",
    intro: "Your order has been cancelled. Please contact us if you have questions.",
  },
};

export const sendOrderStatusEmail = async (order, user) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("Gmail credentials are missing. Skipping order status email.");
    return;
  }

  if (!user?.email) {
    console.warn("Customer email is missing. Order status email skipped.");
    return;
  }

  const emailContent = ORDER_STATUS_EMAILS[order.status];
  if (!emailContent) {
    console.warn(`No customer email template for order status "${order.status}".`);
    return;
  }

  try {
    const transporter = createTransporter();
    const { sources: imageSources, attachments: imageAttachments } =
      await buildEmailImageAssets(order);
    const attachments =
      order.status === "confirmed"
        ? [
            {
              filename: `Invoice-${String(order.invoiceNumber || order._id)
                .replace(/[^a-zA-Z0-9_-]+/g, "-")}.pdf`,
              content: await buildInvoicePdf(order, user),
              contentType: "application/pdf",
            },
            ...imageAttachments,
          ]
        : imageAttachments;

    const result = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: user.email,
      subject: `Your order ${order.invoiceNumber || order._id} ${emailContent.subject}`,
      html: buildHtml(order, user, {
        heading: emailContent.heading,
        intro: emailContent.intro,
        showCustomer: false,
        imageSources,
      }),
      attachments,
    });

    console.log("Order status email sent:", result.messageId);
  } catch (error) {
    console.error("Order status email failed:", error.message);
  }
};

// ==========================================
// 5. LOGIN NOTIFICATION
// ==========================================

export const sendLoginEmail = async (user) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("Gmail credentials are missing. Skipping login email.");
    return;
  }

  if (!user?.email) return;

  try {
    const transporter = createTransporter();

    const name = esc(user.fullName || user.name || "Customer");

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: user.email,
      subject: "New Login - Singha Handicraft",

      html: `
        <div style="background:#f7f3ea;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
          <div style="max-width:600px;margin:0 auto;background:#ffffff;border-top:3px solid #c9a227;padding:28px;">

            <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#c9a227;">
              Singha Handicraft
            </p>

            <h2 style="color:#14110d;">
              Welcome back, ${name}!
            </h2>

            <p style="color:#555;font-size:14px;line-height:1.6;">
              We noticed a successful login to your Singha Handicraft account.
            </p>

            <p style="color:#555;font-size:14px;line-height:1.6;">
              If this was you, no action is required.
              If you don't recognize this activity, please contact us.
            </p>

            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />

            <p style="color:#999;font-size:12px;">
              Thank you for choosing Singha Handicraft.
            </p>

          </div>
        </div>
      `,
    });

    console.log("Login notification sent to:", user.email);
  } catch (error) {
    console.error("Login email failed:", error.message);
  }
};
