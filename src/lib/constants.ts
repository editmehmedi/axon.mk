export const ORDER_STATUSES = [
  "VERIFICATION",
  "PARTS_SOURCED",
  "BUILDING",
  "HANDED_TO_CARGO",
  "DELIVERED_PAID",
] as const;

export type OrderStatusCode = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatusCode, string> = {
  VERIFICATION: "Верификација",
  PARTS_SOURCED: "Делови набавени",
  BUILDING: "Склопување",
  HANDED_TO_CARGO: "Предадено на карго",
  DELIVERED_PAID: "Испорачано и платено",
};

export const STATUS_SHORT: Record<OrderStatusCode, string> = {
  VERIFICATION: "1. Verification",
  PARTS_SOURCED: "2. Parts Sourced",
  BUILDING: "3. Building",
  HANDED_TO_CARGO: "4. Handed to Cargo",
  DELIVERED_PAID: "5. Delivered & Paid",
};

export const ASSEMBLY_FEE_DEFAULT = 2999;

export const BUILDER_STEPS = [
  "CPU",
  "COOLER",
  "MOTHERBOARD",
  "RAM",
  "GPU",
  "PSU",
  "CASE",
  "SSD",
] as const;

export function formatMkd(amount: number): string {
  const n = Math.round(Number(amount) || 0);
  const digits = Math.abs(n).toString();
  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "-" : ""}${withCommas} MKD`;
}

/** Fixed locale/options so SSR and client match. */
export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (v: number) => v.toString().padStart(2, "0");
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Local clock — use on client-only screens (admin). */
export function formatLocalDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (v: number) => v.toString().padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function generateTrackingCode(): string {
  const n = Math.floor(Math.random() * 900000 + 100000);
  return `AXN-${n}`;
}

export function generateCargoCode(): string {
  const n = Math.floor(Math.random() * 900000000 + 100000000);
  return `CGO-${n}`;
}
