import { listSetecCategory } from "@/lib/setecLink";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type StoreListing = {
  name: string;
  priceMkd: number;
  imageUrl: string;
  source: string;
  /** Exact quantity, or yes/no when the shop only publishes availability. */
  inStock: string;
};

const ANOCH_CATEGORIES = {
  cpus: ["procesori"],
  gpus: ["grafichki-karti"],
  rams: ["desktop-ram-memorii"],
  motherboards: ["matichni-plochi"],
  psus: ["napojuvanja"],
  cases: ["kukjishta"],
  ssds: ["interni-ssd"],
  hdds: ["interni-hdd"],
  coolers: ["vozdushni-ladilnici", "vodeno-ladenje"],
} as const;

const SETEC_CATEGORIES = {
  cpus: "Процесори",
  gpus: "Графички Карти",
  rams: "РАМ Меморија",
} as const;

const GJIRAFA_PATHS = {
  cpus: "/za-kompjuter-procesor",
  gpus: "/grafichka-karta-kompjuterski-delovi",
  rams: "/operativna-memorija-kompjuterski-delovi",
} as const;

const NEPTUN_CATEGORIES = {
  cpus: 335,
  gpus: 333,
  rams: 341,
} as const;

function decodeHtml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(Number(num)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function fetchAnhochCategory(slug: string): Promise<StoreListing[]> {
  const rows: StoreListing[] = [];
  let page = 1;
  let last = 1;
  do {
    const url = `https://www.anhoch.com/products?categories[]=${encodeURIComponent(slug)}&perPage=100&page=${page}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": UA,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Anhoch ${slug} HTTP ${res.status}`);
    const data = (await res.json()) as {
      products?: {
        last_page?: number;
        data?: {
          name?: string;
          qty?: number;
          is_in_stock?: boolean;
          selling_price?: { amount?: string; inCurrentCurrency?: { amount?: number } };
          base_image?: { path?: string };
        }[];
      };
    };
    last = data.products?.last_page ?? 1;
    if (last > 25) throw new Error(`Anhoch ${slug} listing looks unfiltered`);
    for (const product of data.products?.data ?? []) {
      const amount = Number(product.selling_price?.inCurrentCurrency?.amount ?? product.selling_price?.amount);
      const priceMkd = Math.round(amount);
      const name = product.name?.trim() ?? "";
      if (!name || !Number.isFinite(priceMkd) || priceMkd <= 0) continue;
      const qty = Number(product.qty);
      const inStock = product.is_in_stock && Number.isFinite(qty) && qty > 0 ? String(Math.round(qty)) : "0";
      rows.push({
        name,
        priceMkd,
        imageUrl: product.base_image?.path?.trim() ?? "",
        source: "anhoch",
        inStock,
      });
    }
    page += 1;
  } while (page <= last);
  if (!rows.length) throw new Error(`Anhoch ${slug} returned no products`);
  return rows;
}

async function fetchGjirafaCategory(path: string): Promise<StoreListing[]> {
  const rows: StoreListing[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = `https://gjirafa50.mk${path}?pagenumber=${page}`;
    const res = await fetch(url, {
      headers: { Accept: "text/html", "User-Agent": UA },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Gjirafa ${path} HTTP ${res.status}`);
    const html = await res.text();
    const declared = Number(html.match(/totalPages\s*=\s*'(\d+)'/)?.[1] ?? "1");
    if (Number.isFinite(declared) && declared > 0) totalPages = declared;
    if (totalPages > 40) throw new Error(`Gjirafa ${path} listing looks unfiltered`);
    const blocks = html.split('class="item-box"').slice(1);
    if (!blocks.length) break;
    for (const block of blocks) {
      const titleRaw =
        block.match(/product-title-lines[^"]*"[^>]*>([^<]+)</)?.[1] ??
        block.match(/<h3 class="product-title">[\s\S]*?>([^<]+)<\/a>/)?.[1];
      const priceRaw = block.match(/data-discountedprice="([\d.,]+)"/)?.[1];
      const name = titleRaw ? decodeHtml(titleRaw) : "";
      const priceMkd = priceRaw ? Math.round(Number(priceRaw.replace(/\./g, "").replace(",", "."))) : 0;
      if (!name || !Number.isFinite(priceMkd) || priceMkd <= 0) continue;
      const image = block.match(/<img[^>]+src="(https:[^"]+)"/)?.[1]?.split("?")[0] ?? "";
      const sold = /продаден|sold-out|out-of-stock/i.test(block);
      rows.push({
        name,
        priceMkd,
        imageUrl: image,
        source: "gjirafa50",
        inStock: sold ? "no" : "yes",
      });
    }
    page += 1;
  } while (page <= totalPages);
  if (!rows.length) throw new Error(`Gjirafa ${path} returned no products`);
  return rows;
}

function neptunImage(path: string | null | undefined): string {
  const raw = path?.trim() ?? "";
  if (!raw) return "";
  if (raw.startsWith("http")) return raw;
  return `https://www.neptun.mk/${raw.replace(/^\/+/, "")}`;
}

async function fetchNeptunCategory(categoryId: number): Promise<StoreListing[]> {
  const rows: StoreListing[] = [];
  let page = 1;
  let total = Infinity;
  while ((page - 1) * 48 < total && page <= 20) {
    const res = await fetch("https://www.neptun.mk/NeptunCategories/LoadProductsForCategory", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "FROM-ANGULAR": "true",
        Origin: "https://www.neptun.mk",
        Referer: "https://www.neptun.mk/",
        "User-Agent": UA,
      },
      body: JSON.stringify({
        model: {
          CategoryId: categoryId,
          Sort: 7,
          Manufacturers: [],
          Recomended: false,
          PriceRange: null,
          BoolFeatures: [],
          DropdownFeatures: [],
          MultiSelectFeatures: [],
          CurrentPage: page,
          ItemsPerPage: 48,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Neptun category ${categoryId} HTTP ${res.status}`);
    const data = (await res.json()) as {
      Batch?: {
        Config?: { TotalItems?: number };
        Items?: {
          Title?: string;
          ActualPrice?: number;
          Quantity?: number;
          AvailableWebshop?: boolean;
          Thumbnail?: string;
        }[];
      };
    };
    total = data.Batch?.Config?.TotalItems ?? 0;
    if (total > 800) throw new Error(`Neptun category ${categoryId} listing looks unfiltered`);
    const items = data.Batch?.Items ?? [];
    if (!items.length) break;
    for (const item of items) {
      const name = item.Title?.replace(/\s+/g, " ").trim() ?? "";
      const priceMkd = Math.round(Number(item.ActualPrice));
      if (!name || !Number.isFinite(priceMkd) || priceMkd <= 0) continue;
      const available = item.AvailableWebshop !== false && Number(item.Quantity) > 0;
      rows.push({
        name,
        priceMkd,
        imageUrl: neptunImage(item.Thumbnail),
        source: "neptun",
        inStock: available ? "yes" : "no",
      });
    }
    page += 1;
  }
  if (!rows.length) throw new Error(`Neptun category ${categoryId} returned no products`);
  return rows;
}

async function fetchSetec(categoryName: string): Promise<StoreListing[]> {
  const hits = await listSetecCategory(categoryName);
  return hits.map((hit) => ({
    name: hit.title,
    priceMkd: hit.priceMkd,
    imageUrl: hit.thumbnail,
    source: "setec",
    inStock: String(hit.quantity),
  }));
}

async function concatCategories(
  jobs: (() => Promise<StoreListing[]>)[],
): Promise<StoreListing[]> {
  const groups = await mapPool(jobs, 3, (job) => job());
  return groups.flat();
}

/** Live rows for the same shop files the catalog seed merges. */
export async function fetchStoreListings(): Promise<Record<string, StoreListing[]>> {
  const [
    anhochCpus,
    anhochGpus,
    anhochRams,
    anhochBoards,
    anhochPsus,
    anhochCases,
    anhochSsds,
    anhochHdds,
    anhochCoolers,
    setecCpus,
    setecGpus,
    setecRams,
    gjirafaCpus,
    gjirafaGpus,
    gjirafaRams,
    neptunCpus,
    neptunGpus,
    neptunRams,
  ] = await Promise.all([
    concatCategories(ANOCH_CATEGORIES.cpus.map((slug) => () => fetchAnhochCategory(slug))),
    concatCategories(ANOCH_CATEGORIES.gpus.map((slug) => () => fetchAnhochCategory(slug))),
    concatCategories(ANOCH_CATEGORIES.rams.map((slug) => () => fetchAnhochCategory(slug))),
    concatCategories(ANOCH_CATEGORIES.motherboards.map((slug) => () => fetchAnhochCategory(slug))),
    concatCategories(ANOCH_CATEGORIES.psus.map((slug) => () => fetchAnhochCategory(slug))),
    concatCategories(ANOCH_CATEGORIES.cases.map((slug) => () => fetchAnhochCategory(slug))),
    concatCategories(ANOCH_CATEGORIES.ssds.map((slug) => () => fetchAnhochCategory(slug))),
    concatCategories(ANOCH_CATEGORIES.hdds.map((slug) => () => fetchAnhochCategory(slug))),
    concatCategories(ANOCH_CATEGORIES.coolers.map((slug) => () => fetchAnhochCategory(slug))),
    fetchSetec(SETEC_CATEGORIES.cpus),
    fetchSetec(SETEC_CATEGORIES.gpus),
    fetchSetec(SETEC_CATEGORIES.rams),
    fetchGjirafaCategory(GJIRAFA_PATHS.cpus),
    fetchGjirafaCategory(GJIRAFA_PATHS.gpus),
    fetchGjirafaCategory(GJIRAFA_PATHS.rams),
    fetchNeptunCategory(NEPTUN_CATEGORIES.cpus),
    fetchNeptunCategory(NEPTUN_CATEGORIES.gpus),
    fetchNeptunCategory(NEPTUN_CATEGORIES.rams),
  ]);

  return {
    "anhoch_cpus.csv": anhochCpus,
    "setec_cpus.csv": setecCpus,
    "gjirafa_cpus.csv": gjirafaCpus,
    "neptun_cpus.csv": neptunCpus,
    "anhoch_gpus.csv": anhochGpus,
    "setec_gpus.csv": setecGpus,
    "gjirafa_gpus.csv": gjirafaGpus,
    "neptun_gpus.csv": neptunGpus,
    "anhoch_rams.csv": anhochRams,
    "setec_rams.csv": setecRams,
    "gjirafa_rams.csv": gjirafaRams,
    "neptun_rams.csv": neptunRams,
    "anhoch_motherboards.csv": anhochBoards,
    "anhoch_psus.csv": anhochPsus,
    "anhoch_cases.csv": anhochCases,
    "anhoch_ssds.csv": anhochSsds,
    "anhoch_hdds.csv": anhochHdds,
    "anhoch_coolers_fans.csv": anhochCoolers,
  };
}
