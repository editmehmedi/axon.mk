import { findSetecProductUrl, setecSearchQuery } from "@/lib/setecLink";
import { normalizeStoreId, type SupplierStoreId } from "@/lib/partStores";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BUNDLE_TITLE =
  /\b(kompjuter\w*|desktop|laptop|notebook|tritonix)\b/i;

const NEPTUN_CATEGORY_PAGE: Record<string, string> = {
  CPU: "https://www.neptun.mk/Procesori.nspx",
  GPU: "https://www.neptun.mk/Graficki_karticki.nspx",
  RAM: "https://www.neptun.mk/DIMM_(desktop)_memorii.nspx",
  MOTHERBOARD: "https://www.neptun.mk/Maticni_ploci.nspx",
  SSD: "https://www.neptun.mk/SSD_diskovi.nspx",
  PSU: "https://www.neptun.mk/Napojuvana.nspx",
  CASE: "https://www.neptun.mk/Kukista.nspx",
  COOLER: "https://www.neptun.mk/CPU_Cooler.nspx",
};

type Candidate = { title: string; url: string };

function tokensOf(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 1);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasToken(hay: string, token: string): boolean {
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(token)}(?:[^a-z0-9]|$)`, "i").test(hay);
}

function scoreTitle(query: string, title: string): number {
  const tokens = tokensOf(query);
  if (!tokens.length) return 0;
  const hay = title.toLowerCase();
  let score = tokens.reduce((sum, token) => sum + (hasToken(hay, token) ? 1 : 0), 0);
  if (BUNDLE_TITLE.test(title) && !BUNDLE_TITLE.test(query)) score -= tokens.length;
  return score;
}

function pickBest(query: string, items: Candidate[]): string | null {
  const need = tokensOf(query).length;
  if (!need) return null;
  let best: { url: string; score: number; len: number } | null = null;
  for (const item of items) {
    if (!item.title || !item.url) continue;
    const score = scoreTitle(query, item.title);
    if (score < need) continue;
    const len = item.title.length;
    if (!best || score > best.score || (score === best.score && len < best.len)) {
      best = { url: item.url, score, len };
    }
  }
  return best?.url ?? null;
}

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
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function findAnhochProductUrl(query: string): Promise<string> {
  const fallback = `https://www.anhoch.com/products?query=${encodeURIComponent(query)}`;
  if (!query) return fallback;
  try {
    const url = new URL("https://www.anhoch.com/products");
    url.searchParams.set("query", query);
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": UA,
      },
      cache: "no-store",
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      products?: { data?: { name?: string; slug?: string }[] };
    };
    const items: Candidate[] = [];
    for (const product of data.products?.data ?? []) {
      const slug = product.slug?.trim().toLowerCase() ?? "";
      if (!product.name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) continue;
      items.push({
        title: product.name,
        url: `https://www.anhoch.com/products/${slug}`,
      });
    }
    return pickBest(query, items) ?? fallback;
  } catch {
    return fallback;
  }
}

async function findGjirafaProductUrl(query: string): Promise<string> {
  const fallback = `https://gjirafa50.mk/search?q=${encodeURIComponent(query)}`;
  if (!query) return fallback;
  try {
    const url = new URL("https://gjirafa50.mk/search");
    url.searchParams.set("q", query);
    const res = await fetch(url, {
      headers: { Accept: "text/html", "User-Agent": UA },
      cache: "no-store",
    });
    if (!res.ok) return fallback;
    const html = await res.text();
    const items: Candidate[] = [];
    const seen = new Set<string>();
    for (const match of html.matchAll(/<a[^>]+href="(\/[^"#?]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const path = match[1] ?? "";
      if (!/^\/[a-z0-9][a-z0-9-]{8,}$/i.test(path) || seen.has(path)) continue;
      const title = decodeHtml(match[2] ?? "");
      if (!title) continue;
      seen.add(path);
      items.push({ title, url: `https://gjirafa50.mk${path}` });
    }
    return pickBest(query, items) ?? fallback;
  } catch {
    return fallback;
  }
}

function neptunProductUrl(slug: string): string | null {
  const path = slug.trim();
  if (path.startsWith("/categories/")) return `https://www.neptun.mk${path}`;
  if (/^\d{5,}-[A-Za-z0-9-]+$/.test(path)) return `https://www.neptun.mk/categories/${path}`;
  return null;
}

function distinctiveTerm(query: string): string {
  return tokensOf(query).reduce(
    (best, token) => (token.length >= best.length ? token : best),
    ""
  );
}

async function neptunAutocomplete(term: string): Promise<Candidate[]> {
  if (!term) return [];
  const res = await fetch("https://www.neptun.mk/Product/SearchProductsAutocomplete", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "FROM-ANGULAR": "true",
      Origin: "https://www.neptun.mk",
      Referer: "https://www.neptun.mk/",
      "User-Agent": UA,
    },
    body: JSON.stringify({ term, page: 1, itemsPerPage: 12 }),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    ProductsResult?: { results?: { Title?: string; Url?: string }[] };
  };
  const items: Candidate[] = [];
  for (const hit of data.ProductsResult?.results ?? []) {
    const url = hit.Url ? neptunProductUrl(hit.Url) : null;
    if (!hit.Title || !url) continue;
    items.push({ title: hit.Title, url });
  }
  return items;
}

async function neptunCategoryProducts(category?: string): Promise<Candidate[]> {
  const page = category ? NEPTUN_CATEGORY_PAGE[category.toUpperCase()] : undefined;
  if (!page) return [];
  const res = await fetch(page, {
    headers: { Accept: "text/html", "User-Agent": UA, "Accept-Language": "mk,en;q=0.9" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const html = (await res.text()).replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const items: Candidate[] = [];
  for (const match of html.matchAll(/"Title":"([^"\\]*)"[\s\S]*?"Url":"(\d{5,}-[^"]+)"/g)) {
    const url = neptunProductUrl(match[2] ?? "");
    if (!match[1] || !url) continue;
    items.push({ title: match[1], url });
  }
  return items;
}

async function findNeptunProductUrl(query: string, category?: string): Promise<string> {
  const fallback = `https://www.neptun.mk/search-product-result.nspx?q=${encodeURIComponent(
    query.replace(/\s+/g, "_")
  )}`;
  if (!query) return fallback;
  try {
    const model = distinctiveTerm(query);
    const [byName, byModel, fromCategory] = await Promise.all([
      neptunAutocomplete(query),
      model && model !== query.toLowerCase() ? neptunAutocomplete(model) : Promise.resolve([]),
      neptunCategoryProducts(category),
    ]);
    return pickBest(query, [...byName, ...byModel, ...fromCategory]) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Product page on the part's shop, or that shop's own search if nothing matches. */
export async function findStoreProductUrl(
  store: string,
  label: string,
  category?: string
): Promise<string | null> {
  const id: SupplierStoreId | null = normalizeStoreId(store);
  const query = setecSearchQuery(label);
  if (id === "setec") return findSetecProductUrl(label);
  if (id === "anhoch") return findAnhochProductUrl(query || label);
  if (id === "neptun") return findNeptunProductUrl(query || label, category);
  if (id === "gjirafa50") return findGjirafaProductUrl(query || label);
  return null;
}
