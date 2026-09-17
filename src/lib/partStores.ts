export type SupplierStoreId =
  | "anhoch"
  | "setec"
  | "neptun"
  | "gjirafa50"
  | "used"
  | "included";

export type SupplierStore = {
  id: SupplierStoreId;
  name: string;
  homepage: string | null;
  searchHost: string | null;
};

export const SUPPLIER_STORES: Record<SupplierStoreId, SupplierStore> = {
  anhoch: {
    id: "anhoch",
    name: "Anhoch",
    homepage: "https://www.anhoch.com/",
    searchHost: "anhoch.com",
  },
  setec: {
    id: "setec",
    name: "Setec",
    homepage: "https://www.setec.mk/",
    searchHost: "setec.mk",
  },
  neptun: {
    id: "neptun",
    name: "Neptun",
    homepage: "https://www.neptun.mk/",
    searchHost: "neptun.mk",
  },
  gjirafa50: {
    id: "gjirafa50",
    name: "Gjirafa50",
    homepage: "https://gjirafa50.com/",
    searchHost: "gjirafa50.com",
  },
  used: {
    id: "used",
    name: "Used / marketplace",
    homepage: null,
    searchHost: null,
  },
  included: {
    id: "included",
    name: "Included",
    homepage: null,
    searchHost: null,
  },
};

const SOURCE_ALIASES: Record<string, SupplierStoreId> = {
  anhoch: "anhoch",
  setec: "setec",
  neptun: "neptun",
  gjirafa50: "gjirafa50",
  gjirafa: "gjirafa50",
  "gjirafa 50": "gjirafa50",
  used: "used",
  included: "included",
  oem: "included",
};

export function normalizeStoreId(raw?: string | null): SupplierStoreId | null {
  if (!raw) return null;
  return SOURCE_ALIASES[raw.trim().toLowerCase()] ?? null;
}

export function inferStoreIdFromImageUrl(imageUrl?: string | null): SupplierStoreId | null {
  if (!imageUrl) return null;
  const u = imageUrl.toLowerCase();
  if (u.includes("anhoch.com")) return "anhoch";
  if (u.includes("setec")) return "setec";
  if (u.includes("neptun")) return "neptun";
  if (u.includes("gjirafa")) return "gjirafa50";
  return null;
}

export function inferStoreIdFromCsvPath(csvPath?: string | null): SupplierStoreId | null {
  if (!csvPath) return null;
  const file = csvPath.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  if (file.includes("setec")) return "setec";
  if (file.includes("neptun")) return "neptun";
  if (file.includes("gjirafa")) return "gjirafa50";
  if (file.includes("anhoch")) return "anhoch";
  return null;
}

export function resolveStoreId(input: {
  source?: string | null;
  imageUrl?: string | null;
  csvPath?: string | null;
  used?: boolean;
  included?: boolean;
}): SupplierStoreId {
  if (input.used) return "used";
  if (input.included) return "included";
  return (
    normalizeStoreId(input.source) ||
    inferStoreIdFromImageUrl(input.imageUrl) ||
    inferStoreIdFromCsvPath(input.csvPath) ||
    "anhoch"
  );
}

export function getSupplierStore(id: SupplierStoreId | string | null | undefined): SupplierStore {
  const normalized = normalizeStoreId(id) ?? "anhoch";
  return SUPPLIER_STORES[normalized];
}

export function storeSearchUrl(store: SupplierStore, query: string): string | null {
  if (!store.searchHost) return null;
  return `https://www.google.com/search?q=${encodeURIComponent(`${query} site:${store.searchHost}`)}`;
}
