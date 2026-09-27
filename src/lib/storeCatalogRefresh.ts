import fs from "fs";
import os from "os";
import path from "path";
import {
  isStockCoolerPart,
  loadAllAnhochParts,
  type AnhochPart,
} from "../../prisma/anhochInventory";
import { prisma } from "@/lib/db";
import { fetchStoreListings, type StoreListing } from "@/lib/storeCatalogFetch";

export type StoreRefreshResult = {
  prices: number;
  stocks: number;
  added: number;
  removed: number;
  checked: number;
};

type DbPart = {
  id: string;
  name: string;
  brand: string;
  category: string;
  priceMkd: number;
  stock: number;
  imageUrl: string | null;
  active: boolean;
};

function csvCell(value: string): string {
  const clean = value.replace(/"/g, "'");
  if (/[,\r\n]/.test(clean)) return `"${clean}"`;
  return clean;
}

function writeListings(dir: string, file: string, rows: StoreListing[]) {
  const lines = ["name,price_mkd,image_url,source,in_stock"];
  for (const row of rows) {
    lines.push(
      [csvCell(row.name), String(row.priceMkd), csvCell(row.imageUrl), row.source, row.inStock].join(","),
    );
  }
  fs.writeFileSync(path.join(dir, file), lines.join("\n"), "utf8");
}

function partKey(part: { category: string; brand: string; name: string }): string {
  return `${part.category}|${part.brand}|${part.name}`.toLowerCase().replace(/\s+/g, " ").trim();
}

function isStoreImage(url: string | null | undefined): boolean {
  if (!url) return false;
  const value = url.toLowerCase();
  return (
    value.includes("anhoch") ||
    value.includes("setec") ||
    value.includes("neptun") ||
    value.includes("gjirafa")
  );
}

function isCatalogPart(part: { brand: string; name: string; imageUrl: string | null }): boolean {
  if (isStockCoolerPart(part)) return false;
  const image = part.imageUrl ?? "";
  if (!image) return false;
  return image.startsWith("/parts/exact/") || isStoreImage(image);
}

function preferOffer(prev: AnhochPart, next: AnhochPart): AnhochPart {
  const prevIn = prev.stock > 0;
  const nextIn = next.stock > 0;
  if (nextIn && !prevIn) return next;
  if (prevIn && !nextIn) return prev;
  return next.priceMkd < prev.priceMkd ? next : prev;
}

function dedupeOffers(parts: AnhochPart[]): AnhochPart[] {
  const best = new Map<string, AnhochPart>();
  for (const part of parts) {
    if (isStockCoolerPart(part)) continue;
    const key = partKey(part);
    const prev = best.get(key);
    best.set(key, prev ? preferOffer(prev, part) : part);
  }
  return [...best.values()];
}

async function loadFreshParts(listings: Record<string, StoreListing[]>): Promise<AnhochPart[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axon-stores-"));
  try {
    for (const [file, rows] of Object.entries(listings)) writeListings(dir, file, rows);
    const file = (name: string) => path.join(dir, name);
    return loadAllAnhochParts({
      cpus: file("anhoch_cpus.csv"),
      extraCpus: [file("setec_cpus.csv"), file("gjirafa_cpus.csv"), file("neptun_cpus.csv")],
      motherboards: file("anhoch_motherboards.csv"),
      gpus: file("anhoch_gpus.csv"),
      extraGpus: [file("setec_gpus.csv"), file("gjirafa_gpus.csv"), file("neptun_gpus.csv")],
      rams: file("anhoch_rams.csv"),
      extraRams: [file("setec_rams.csv"), file("gjirafa_rams.csv"), file("neptun_rams.csv")],
      psus: file("anhoch_psus.csv"),
      cases: file("anhoch_cases.csv"),
      ssds: file("anhoch_ssds.csv"),
      hdds: file("anhoch_hdds.csv"),
      coolers: file("anhoch_coolers_fans.csv"),
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function createData(part: AnhochPart) {
  return {
    name: part.name,
    brand: part.brand,
    category: part.category,
    priceMkd: part.priceMkd,
    stock: part.stock,
    socket: part.socket ?? null,
    ramType: part.ramType ?? null,
    wattage: part.wattage ?? null,
    tdpWatts: part.tdpWatts ?? null,
    formFactor: part.formFactor ?? null,
    includesCooler: part.includesCooler ?? false,
    imageUrl: part.imageUrl || null,
    active: part.stock > 0,
  };
}

/** Pull Anhoch, Setec, Neptun, and Gjirafa and apply price, stock, and catalog changes. */
export async function refreshStoreCatalog(options?: { apply?: boolean }): Promise<StoreRefreshResult> {
  const apply = options?.apply !== false;
  const listings = await fetchStoreListings();
  const checked = Object.values(listings).reduce((sum, rows) => sum + rows.length, 0);
  const fresh = dedupeOffers(await loadFreshParts(listings));
  const freshByKey = new Map(fresh.map((part) => [partKey(part), part]));

  const existing = await prisma.part.findMany({
    select: {
      id: true,
      name: true,
      brand: true,
      category: true,
      priceMkd: true,
      stock: true,
      imageUrl: true,
      active: true,
    },
  });

  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const creates: ReturnType<typeof createData>[] = [];
  let prices = 0;
  let stocks = 0;
  let removed = 0;
  const matched = new Set<string>();

  for (const part of existing) {
    if (isStockCoolerPart(part)) continue;
    const next = freshByKey.get(partKey(part));
    if (!next) continue;
    matched.add(partKey(part));
    const data: Record<string, unknown> = {};
    if (part.priceMkd !== next.priceMkd) {
      data.priceMkd = next.priceMkd;
      prices += 1;
    }
    if (part.stock !== next.stock) {
      data.stock = next.stock;
      stocks += 1;
      if (next.stock > 0 && part.stock === 0 && !part.active) data.active = true;
    }
    if (next.imageUrl && isStoreImage(part.imageUrl) && part.imageUrl !== next.imageUrl) {
      data.imageUrl = next.imageUrl;
    }
    if (Object.keys(data).length) updates.push({ id: part.id, data });
  }

  for (const part of fresh) {
    if (!matched.has(partKey(part))) creates.push(createData(part));
  }

  const removals: string[] = [];
  for (const part of existing) {
    if (!isCatalogPart(part)) continue;
    if (freshByKey.has(partKey(part))) continue;
    if (part.stock === 0 && !part.active) continue;
    removals.push(part.id);
  }

  const catalogSize = existing.filter(isCatalogPart).length;
  if (catalogSize > 20 && removals.length > catalogSize * 0.4) {
    throw new Error("Store refresh looked wrong, so nothing was changed. Try again.");
  }
  removed = removals.length;

  if (apply) {
    await prisma.$transaction(
      async (tx) => {
        for (const update of updates) {
          await tx.part.update({ where: { id: update.id }, data: update.data });
        }
        if (creates.length) await tx.part.createMany({ data: creates });
        if (removals.length) {
          await tx.part.updateMany({
            where: { id: { in: removals } },
            data: { stock: 0, active: false },
          });
        }
      },
      { timeout: 60000 },
    );
  }

  return { prices, stocks, added: creates.length, removed, checked };
}
