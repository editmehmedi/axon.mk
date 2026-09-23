import warrantyTable from "@/data/partWarranty.json";

const monthsByPart = warrantyTable as Record<string, number>;

/** Used parts are covered for 3 months, matching the store warranty policy. */
export const USED_PART_WARRANTY_MONTHS = 3;

/** Warranty months listed by the shop for this catalog part, when we have it. */
export function catalogWarrantyMonths(part: {
  category?: string | null;
  brand?: string | null;
  name?: string | null;
}): number | null {
  if (!part.category || !part.name) return null;
  const months = monthsByPart[`${part.category}|${part.brand ?? ""}|${part.name}`];
  return typeof months === "number" && months > 0 ? months : null;
}
