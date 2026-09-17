/** Categories for community sell listings. */
export const LISTING_CATEGORIES = [
  "PC",
  "CPU",
  "GPU",
  "MOTHERBOARD",
  "RAM",
  "PSU",
  "CASE",
  "SSD",
  "COOLER",
  "OTHER",
] as const;

export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

/** Parts only — full PCs appear under /used, not /used-parts. */
export const PART_LISTING_CATEGORIES = LISTING_CATEGORIES.filter(
  (c) => c !== "PC",
) as Exclude<ListingCategory, "PC">[];

export function isListingCategory(value: string): value is ListingCategory {
  return (LISTING_CATEGORIES as readonly string[]).includes(value);
}

export function isPartListingCategory(value: string): boolean {
  return (PART_LISTING_CATEGORIES as readonly string[]).includes(value);
}
