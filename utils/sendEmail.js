
import nodemailer from "nodemailer";
import { createInvoicePdf } from "./invoicePdf.js";

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
      pass: process.env.EMAIL_PASS,
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

// ==========================================
// 3. ORDER EMAIL HTML
// ==========================================

const buildHtml = (
  order,
  user,
  { heading, intro, showButton, showCustomer }
) => {
  const address = order.shippingAddress || {};

  const rows = (order.items || [])
    .map((item) => {
      const image = absoluteImage(getProductImage(item));

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

        ${
          showButton
            ? `
              <p style="margin:28px 0 0;">
                <strong style="font-size:13px;color:#555;">Your PDF invoice is attached to this email.</strong>
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

    // Customer order confirmation.
    if (user?.email) {
      const pdf = await createInvoicePdf(order, user);

      jobs.push(
        transporter.sendMail({
          from,
          to: user.email,
          subject: `Your order ${order.invoiceNumber || order._id} is confirmed`,
          attachments: [
            {
              filename: `invoice-${order.invoiceNumber || order._id}.pdf`,
              content: pdf,
              contentType: "application/pdf",
            },
          ],
          html: buildHtml(order, user, {
            heading: "Thank you for your order",
            intro: "We've received your order and will confirm it shortly.",
            showButton: true,
            showCustomer: false,
          }),
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
            showButton: false,
            showCustomer: true,
          }),
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
