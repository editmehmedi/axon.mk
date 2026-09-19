import nodemailer from "nodemailer";
import { formatMkd } from "@/lib/constants";
import { prisma } from "@/lib/db";

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

function smtpUser(): string {
  return (process.env.SMTP_USER || "").trim();
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

/** Always From: Name <authenticated Gmail>, never a nested address. */
function mailFromHeader(): string {
  const user = smtpUser() || "noreply@axon.mk";
  return `AXON.MK <${user}>`;
}

async function sendMail(opts: {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  if (!smtpConfigured()) {
    console.log("[email] SMTP not configured — preview:");
    console.log({ to: opts.to, subject: opts.subject, text: opts.text });
    return;
  }

  const user = smtpUser();
  const transport = createTransport();
  await transport.sendMail({
    from: mailFromHeader(),
    replyTo: user,
    envelope: { from: user, to: opts.to },
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

async function adminNotifyEmails(): Promise<string[]> {
  const smtp = smtpUser().toLowerCase();
  const fromEnv = [process.env.ORDER_NOTIFY_EMAIL, smtp]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));

  const admins = await prisma.user.findMany({
    where: { role: { in: ["admin", "head_admin"] } },
    select: { email: true },
  });
  const extra = admins
    .map((admin) => admin.email.toLowerCase())
    .filter((email) => !email.endsWith("@axon.mk") || email === smtp);

  return [...new Set([...fromEnv, ...extra])];
}

function buildOrderEmailHtml(payload: OrderEmailPayload): string {
  const rows = payload.lines
    .map((line) => {
      const price =
        line.priceMkd != null && line.priceMkd > 0
          ? formatMkd(line.priceMkd)
          : "—";
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px;">${escapeHtml(line.category)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px;">${escapeHtml(line.label)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;white-space:nowrap;">${escapeHtml(price)}</td>
      </tr>`;
    })
    .join("");

  const kind = payload.orderType === "PREBUILT" ? "Pre-built PC" : "Custom build";

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;">AXON.MK</p>
    <p style="margin:0 0 12px;">Hi ${escapeHtml(payload.customerName)},</p>
    <p style="margin:0 0 16px;line-height:1.5;">
      You ordered ${escapeHtml(payload.productName)} (${escapeHtml(kind)}).
      We will call you to confirm. Payment is cash on delivery.
    </p>
    <p style="margin:0 0 16px;"><strong>Tracking:</strong> ${escapeHtml(payload.trackingCode)}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;font-size:13px;">Part</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;font-size:13px;">Specs</th>
          <th style="padding:8px;text-align:right;border-bottom:1px solid #e5e7eb;font-size:13px;">Price</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:0 0 6px;">Parts: ${escapeHtml(formatMkd(payload.partsCostMkd))}</p>
    ${
      payload.assemblyFeeMkd > 0
        ? `<p style="margin:0 0 6px;">Assembly: ${escapeHtml(formatMkd(payload.assemblyFeeMkd))}</p>`
        : ""
    }
    <p style="margin:0 0 16px;"><strong>Total: ${escapeHtml(formatMkd(payload.totalMkd))}</strong></p>
    <p style="margin:0 0 6px;">Phone: ${escapeHtml(payload.customerPhone)}</p>
    <p style="margin:0 0 20px;">Address: ${escapeHtml(payload.customerAddress)}, ${escapeHtml(payload.city)}</p>
    <p style="margin:0;font-size:12px;color:#6b7280;">AXON.MK · Custom PC assembly · North Macedonia</p>
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
    `Hi ${payload.customerName},`,
    ``,
    `You ordered ${payload.productName}.`,
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
    ``,
    `AXON.MK`,
  ]
    .filter((x) => x != null)
    .join("\n");
}

/** Sends order confirmation to the customer. */
export async function sendOrderConfirmationEmail(payload: OrderEmailPayload): Promise<void> {
  await sendMail({
    to: payload.to,
    subject: `You ordered ${payload.productName} — ${payload.trackingCode}`,
    text: buildOrderEmailText(payload),
    html: buildOrderEmailHtml(payload),
  });
}

/** Sends a new-order alert to support Gmail and every admin account. */
export async function sendAdminNewOrderEmail(payload: OrderEmailPayload): Promise<void> {
  const to = await adminNotifyEmails();
  if (to.length === 0) return;

  const kind = payload.orderType === "PREBUILT" ? "Pre-built PC" : "Custom build";
  const specs = payload.lines
    .map((line) => {
      const price =
        line.priceMkd != null && line.priceMkd > 0 ? ` — ${formatMkd(line.priceMkd)}` : "";
      return `- ${line.category}: ${line.label}${price}`;
    })
    .join("\n");

  const text = [
    `New order on AXON.MK`,
    ``,
    `Tracking: ${payload.trackingCode}`,
    `Product: ${payload.productName} (${kind})`,
    `Total: ${formatMkd(payload.totalMkd)} · Cash on Delivery`,
    ``,
    `Customer: ${payload.customerName}`,
    `Email: ${payload.to}`,
    `Phone: ${payload.customerPhone}`,
    `Address: ${payload.customerAddress}, ${payload.city}`,
    ``,
    `Specs:`,
    specs,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;">AXON.MK — New order</p>
    <p style="margin:0 0 12px;"><strong>Tracking:</strong> ${escapeHtml(payload.trackingCode)}</p>
    <p style="margin:0 0 12px;"><strong>Product:</strong> ${escapeHtml(payload.productName)} (${escapeHtml(kind)})</p>
    <p style="margin:0 0 16px;"><strong>Total:</strong> ${escapeHtml(formatMkd(payload.totalMkd))} · Cash on Delivery</p>
    <p style="margin:0 0 6px;"><strong>Customer:</strong> ${escapeHtml(payload.customerName)}</p>
    <p style="margin:0 0 6px;"><strong>Email:</strong> ${escapeHtml(payload.to)}</p>
    <p style="margin:0 0 6px;"><strong>Phone:</strong> ${escapeHtml(payload.customerPhone)}</p>
    <p style="margin:0 0 16px;"><strong>Address:</strong> ${escapeHtml(payload.customerAddress)}, ${escapeHtml(payload.city)}</p>
    <pre style="margin:0;font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap;">${escapeHtml(specs)}</pre>
  </div>
</body>
</html>`;

  await sendMail({
    to,
    subject: `New order: ${payload.productName} — ${payload.trackingCode}`,
    text,
    html,
  });
}

export async function sendVerificationEmail(opts: {
  to: string;
  name: string;
  code: string;
}): Promise<void> {
  const subject = `${opts.code} is your AXON.MK code`;
  const text = [
    `Hi ${opts.name},`,
    ``,
    `Your AXON.MK code is ${opts.code}.`,
    `It expires in 15 minutes.`,
    ``,
    `If you did not create an account, you can ignore this message.`,
    ``,
    `AXON.MK`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;">AXON.MK</p>
    <p style="margin:0 0 12px;">Hi ${escapeHtml(opts.name)},</p>
    <p style="margin:0 0 16px;line-height:1.5;">Your AXON.MK code is:</p>
    <p style="margin:0 0 16px;font-size:28px;font-weight:700;letter-spacing:0.12em;">${escapeHtml(opts.code)}</p>
    <p style="margin:0;font-size:13px;color:#6b7280;">This code expires in 15 minutes. If you did not register, ignore this message.</p>
  </div>
</body>
</html>`;

  await sendMail({ to: opts.to, subject, text, html });
}
