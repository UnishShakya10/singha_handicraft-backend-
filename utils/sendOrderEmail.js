import { Resend } from "resend";

const PAYMENT_LABELS = {
  cod: "Cash on delivery",
  bank: "Bank transfer",
  wallet: "Digital wallet",
};

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (amount) => `NPR ${Number(amount || 0).toLocaleString("en-US")}`;

// Email clients need a full https address with no port
const absoluteImage = (value) => {
  if (!value) return "";
  const base = (process.env.BACKEND_URL || "").replace(/\/+$/, "");
  let url = String(value).trim();
  if (url.startsWith("/")) url = `${base}${url}`;
  if (/localhost|127\.0\.0\.1/.test(url)) return "";
  return url
    .replace(/(onrender\.com):\d+/, "$1")
    .replace(/^http:\/\//, "https://");
};

const buildHtml = (order, user, { heading, intro, showButton, showCustomer }) => {
  const address = order.shippingAddress || {};
  const frontend = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
  const invoiceLink = `${frontend}/invoice/${order._id}`;

  const rows = order.items
    .map((item) => {
      const image = absoluteImage(item.image);
      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #eee;width:72px;">
            ${
              image
                ? `<img src="${esc(image)}" alt="${esc(item.name)}" width="64" height="64" style="display:block;border-radius:6px;object-fit:cover;background:#f1ede2;" />`
                : ""
            }
          </td>
          <td style="padding:12px 8px;border-bottom:1px solid #eee;font-size:14px;color:#14110d;">
            <strong>${esc(item.name)}</strong><br />
            <span style="color:#777;font-size:12px;">Qty ${item.quantity} × ${money(item.price)}</span>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;font-size:14px;color:#14110d;">
            ${money(item.price * item.quantity)}
          </td>
        </tr>`;
    })
    .join("");

  const addressLines = [
    address.fullName,
    address.address,
    [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    address.phone,
  ]
    .filter(Boolean)
    .map(esc)
    .join("<br />");

  return `
  <div style="background:#f7f3ea;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-top:3px solid #c9a227;padding:28px;">
      <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#c9a227;">Singha Handicraft</p>
      <h1 style="margin:8px 0 4px;font-size:22px;color:#14110d;">${esc(heading)}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#555;">${esc(intro)}</p>

      <p style="margin:0 0 4px;font-size:13px;color:#777;">
        Order <strong style="color:#14110d;">${esc(order.invoiceNumber)}</strong>
        · ${new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-collapse:collapse;">
        ${rows}
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
        <tr>
          <td style="font-size:14px;color:#777;">Total</td>
          <td style="text-align:right;font-size:18px;font-weight:bold;color:#14110d;">${money(order.totalAmount)}</td>
        </tr>
        <tr>
          <td style="padding-top:6px;font-size:13px;color:#777;">Payment</td>
          <td style="padding-top:6px;text-align:right;font-size:13px;color:#14110d;">${esc(PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod)}</td>
        </tr>
      </table>

      <p style="margin:24px 0 6px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#777;">Delivery details</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#14110d;">${addressLines}</p>

      ${
        showCustomer
          ? `<p style="margin:16px 0 0;font-size:13px;color:#555;">Customer: ${esc(user?.fullName)} · ${esc(user?.email)}</p>`
          : ""
      }

      ${
        showButton
          ? `<p style="margin:28px 0 0;">
              <a href="${esc(invoiceLink)}" style="display:inline-block;background:#14110d;color:#ffffff;text-decoration:none;padding:12px 22px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">View invoice</a>
            </p>
            <p style="margin:10px 0 0;font-size:12px;color:#999;">You'll need to be logged in to view your invoice.</p>`
          : ""
      }
    </div>
  </div>`;
};

export const sendOrderEmails = async (order, user) => {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY is not set. Skipping order emails.");
    return;
  }

  // Created here (not at the top) so .env is already loaded
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from =
    process.env.EMAIL_FROM || "Singha Handicraft <onboarding@resend.dev>";
  const jobs = [];

  if (user?.email) {
    jobs.push(
      resend.emails.send({
        from,
        to: user.email,
        subject: `Your order ${order.invoiceNumber} is confirmed`,
        html: buildHtml(order, user, {
          heading: "Thank you for your order",
          intro: "We've received your order and will confirm it shortly.",
          showButton: true,
          showCustomer: false,
        }),
      })
    );
  }

  if (process.env.SHOP_EMAIL) {
    jobs.push(
      resend.emails.send({
        from,
        to: process.env.SHOP_EMAIL,
        subject: `New order ${order.invoiceNumber}`,
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
    } else if (result.value?.error) {
      console.error("Order email failed:", result.value.error.message);
    }
  });
};