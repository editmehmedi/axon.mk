import nodemailer from "nodemailer";
import { formatMkd } from "@/lib/constants";

export type OrderEmailLine = {
  category: string;
  label: string;
  priceMkd?: number | null;
};

export type OrderEmailPayload = {
  to: string;
  customerName: string;
  trackingCode: string;
  orderType: "PREBUILT" | "CUSTOM";
  productName: string;
  lines: OrderEmailLine[];
  partsCostMkd: number;
  assemblyFeeMkd: number;
  totalMkd: number;
  customerPhone: string;
  customerAddress: string;
  city: string;
};

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildOrderEmailHtml(payload: OrderEmailPayload): string {
  const rows = payload.lines
    .map((line) => {
      const price =
        line.priceMkd != null && line.priceMkd > 0
          ? formatMkd(line.priceMkd)
          : "—";
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #1e293b;color:#67e8f9;font-size:12px;text-transform:uppercase;">${escapeHtml(line.category)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #1e293b;color:#e2e8f0;">${escapeHtml(line.label)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #1e293b;color:#94a3b8;text-align:right;white-space:nowrap;">${escapeHtml(price)}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#070b12;font-family:Segoe UI,Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
    <h1 style="margin:0 0 6px;color:#22d3ee;font-size:28px;letter-spacing:0.08em;">AXON.MK</h1>
    <p style="margin:0 0 22px;color:#94a3b8;font-size:14px;">Order confirmation</p>

    <p style="margin:0 0 10px;font-size:16px;">Hi ${escapeHtml(payload.customerName)},</p>
    <p style="margin:0 0 18px;color:#94a3b8;font-size:14px;line-height:1.5;">
      Your order has been received. We will contact you by phone to verify it.
    </p>

    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:16px;margin-bottom:16px;">
      <p style="margin:0 0 6px;font-size:12px;color:#67e8f9;text-transform:uppercase;letter-spacing:0.06em;">Tracking code</p>
      <p style="margin:0;font-size:22px;font-weight:700;color:#22d3ee;">${escapeHtml(payload.trackingCode)}</p>
      <p style="margin:10px 0 0;font-size:14px;color:#e2e8f0;">${escapeHtml(payload.productName)}</p>
      <p style="margin:4px 0 0;font-size:12px;color:#64748b;">${payload.orderType === "PREBUILT" ? "Pre-built PC" : "Custom build"}</p>
    </div>

    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;overflow:hidden;margin-bottom:16px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#111827;">
            <th style="padding:10px;text-align:left;font-size:11px;color:#94a3b8;">Part</th>
            <th style="padding:10px;text-align:left;font-size:11px;color:#94a3b8;">Specs</th>
            <th style="padding:10px;text-align:right;font-size:11px;color:#94a3b8;">Price</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;">
        <span style="color:#94a3b8;">Parts</span>
        <span>${escapeHtml(formatMkd(payload.partsCostMkd))}</span>
      </div>
      ${
        payload.assemblyFeeMkd > 0
          ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;">
              <span style="color:#94a3b8;">Assembly</span>
              <span>${escapeHtml(formatMkd(payload.assemblyFeeMkd))}</span>
            </div>`
          : ""
      }
      <div style="display:flex;justify-content:space-between;padding-top:10px;border-top:1px solid #1e293b;font-size:16px;font-weight:700;">
        <span>Total</span>
        <span style="color:#22d3ee;">${escapeHtml(formatMkd(payload.totalMkd))}</span>
      </div>
      <p style="margin:10px 0 0;font-size:12px;color:#64748b;">Payment: Cash on Delivery</p>
    </div>

    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:16px;margin-bottom:22px;font-size:13px;color:#94a3b8;line-height:1.55;">
      <p style="margin:0;"><strong style="color:#e2e8f0;">Phone:</strong> ${escapeHtml(payload.customerPhone)}</p>
      <p style="margin:6px 0 0;"><strong style="color:#e2e8f0;">Address:</strong> ${escapeHtml(payload.customerAddress)}, ${escapeHtml(payload.city)}</p>
    </div>

    <p style="margin:0;font-size:12px;color:#64748b;">AXON.MK · Custom PC assembly · North Macedonia</p>
  </div>
</body>
</html>`;
}

function buildOrderEmailText(payload: OrderEmailPayload): string {
  const specs = payload.lines
    .map((l) => {
      const price =
        l.priceMkd != null && l.priceMkd > 0 ? ` — ${formatMkd(l.priceMkd)}` : "";
      return `- ${l.category}: ${l.label}${price}`;
    })
    .join("\n");

  return [
    `AXON.MK — Order confirmation`,
    ``,
    `Hi ${payload.customerName},`,
    `Your order has been received.`,
    ``,
    `Tracking: ${payload.trackingCode}`,
    `Product: ${payload.productName}`,
    ``,
    `Specs:`,
    specs,
    ``,
    `Parts: ${formatMkd(payload.partsCostMkd)}`,
    payload.assemblyFeeMkd > 0 ? `Assembly: ${formatMkd(payload.assemblyFeeMkd)}` : null,
    `Total: ${formatMkd(payload.totalMkd)}`,
    `Payment: Cash on Delivery`,
    ``,
    `Phone: ${payload.customerPhone}`,
    `Address: ${payload.customerAddress}, ${payload.city}`,
  ]
    .filter((x) => x != null)
    .join("\n");
}

/** Sends order confirmation to the customer (and optional admin BCC). */
export async function sendOrderConfirmationEmail(payload: OrderEmailPayload): Promise<void> {
  const subject = `AXON.MK order ${payload.trackingCode} — ${payload.productName}`;
  const html = buildOrderEmailHtml(payload);
  const text = buildOrderEmailText(payload);
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@axon.mk";
  const adminCopy = process.env.ORDER_NOTIFY_EMAIL || process.env.SMTP_USER;

  if (!smtpConfigured()) {
    console.log("[email] SMTP not configured — order confirmation preview:");
    console.log({ to: payload.to, subject, text });
    return;
  }

  const transport = createTransport();
  await transport.sendMail({
    from: `AXON.MK <${from}>`,
    to: payload.to,
    bcc: adminCopy && adminCopy !== payload.to ? adminCopy : undefined,
    subject,
    text,
    html,
  });
}
