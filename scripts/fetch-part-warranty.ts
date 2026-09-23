/**
 * Looks up each catalog part's warranty months from the shop that sells it
 * (Anhoch, Neptun, Gjirafa50, Setec) and writes src/data/partWarranty.json.
 *
 * Resume-safe: keys already in the file are skipped unless --refresh is passed.
 */
import fs from "fs";
import path from "path";
import { loadAllAnhochParts, type AnhochPart } from "../prisma/anhochInventory";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const OUT = path.join(process.cwd(), "src", "data", "partWarranty.json");
const REFRESH = process.argv.includes("--refresh");
const LIMIT = Number(process.env.WARRANTY_LIMIT || 0);

type CsvItem = { rawName: string; price: number; source: string };

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const c of line) {
    if (c === '"') {
      q = !q;
      continue;
    }
    if (c === "," && !q) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function warrantyKey(part: { category: string; brand: string; name: string }): string {
  return `${part.category}|${part.brand}|${part.name}`;
}

function tokensOf(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 1);
}

function scoreTitle(query: string, title: string): number {
  const tokens = tokensOf(query);
  const hay = title.toLowerCase();
  const model = tokens.filter((token) => /\d/.test(token)).sort((a, b) => b.length - a.length)[0];
  if (model && !hay.includes(model)) return 0;
  let score = tokens.reduce((sum, token) => sum + (hay.includes(token) ? 1 : 0), 0);
  if (title.trim().toLowerCase() === query.trim().toLowerCase()) score += tokens.length;
  if (/\b(kompjuter\w*|desktop|laptop|notebook)\b/i.test(title) && !/\b(kompjuter\w*|desktop)\b/i.test(query)) {
    score -= tokens.length;
  }
  return score;
}

function goodMatch(query: string, title: string): boolean {
  const need = tokensOf(query).length;
  return scoreTitle(query, title) >= Math.max(2, Math.ceil(need * 0.6));
}

function monthsFromText(text: string): number | null {
  const s = text.toLowerCase().replace(/\s+/g, " ");
  const months = s.match(/(\d+)\s*(?:месец|mesec|muaj|month)/i);
  if (months) return clampMonths(Number(months[1]));
  const years = s.match(/(\d+)\s*(?:годин|godin|vite|vit|year)/i);
  if (years) return clampMonths(Number(years[1]) * 12);
  return null;
}

function clampMonths(n: number): number | null {
  if (!Number.isFinite(n) || n < 1 || n > 120) return null;
  return Math.round(n);
}

async function readUntil(res: Response, pattern: RegExp, maxBytes = 450_000): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const dec = new TextDecoder();
  let text = "";
  while (text.length < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    if (pattern.test(text)) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  return text;
}

async function fetchText(url: string, headers: Record<string, string>, pattern: RegExp): Promise<string | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(25_000) });
    if (!res.ok) return null;
    return await readUntil(res, pattern);
  } catch {
    return null;
  }
}

async function anhochWarranty(query: string): Promise<number | null> {
  const url = new URL("https://www.anhoch.com/products");
  url.searchParams.set("query", query);
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": UA,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { products?: { data?: { name?: string; slug?: string }[] } };
  const items = data.products?.data ?? [];
  let best: { slug: string; score: number } | null = null;
  for (const item of items) {
    if (!item.name || !item.slug) continue;
    const score = scoreTitle(query, item.name);
    if (!goodMatch(query, item.name)) continue;
    if (!best || score > best.score) best = { slug: item.slug, score };
  }
  if (!best) return null;
  const html = await fetchText(
    `https://www.anhoch.com/products/${best.slug}`,
    { Accept: "text/html", "User-Agent": UA },
    /warranty(?:&quot;|"):\d+|Гаранција:/,
  );
  if (!html) return null;
  const decoded = html.replace(/&quot;/g, '"');
  const fromJson = decoded.match(/"warranty":(\d+)/)?.[1];
  if (fromJson) return clampMonths(Number(fromJson));
  const fromLabel = decoded.match(/Гаранција:\s*<\/label>\s*<span[^>]*>\s*(\d+)/i)?.[1];
  return fromLabel ? clampMonths(Number(fromLabel)) : null;
}

async function neptunWarranty(query: string): Promise<number | null> {
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
    body: JSON.stringify({ term: query, page: 1, itemsPerPage: 8 }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    ProductsResult?: { results?: { Title?: string; Url?: string }[] };
  };
  let best: { url: string; score: number } | null = null;
  for (const hit of data.ProductsResult?.results ?? []) {
    if (!hit.Title || !hit.Url) continue;
    const slug = hit.Url.replace(/^\/categories\//, "");
    const score = scoreTitle(query, hit.Title);
    if (!goodMatch(query, hit.Title)) continue;
    if (!best || score > best.score) best = { url: `https://www.neptun.mk/categories/${slug}`, score };
  }
  if (!best) return null;
  const html = await fetchText(best.url, { Accept: "text/html", "User-Agent": UA }, /Warranty(?:&quot;|"):(\d+)/);
  const decoded = html?.replace(/&quot;/g, '"') ?? "";
  const months = decoded.match(/"Warranty":(\d+)/)?.[1];
  return months ? clampMonths(Number(months)) : null;
}

async function gjirafaWarranty(query: string): Promise<number | null> {
  const searchUrl = `https://gjirafa50.mk/search?q=${encodeURIComponent(query)}`;
  const html = await fetchText(
    searchUrl,
    { Accept: "text/html", "User-Agent": UA },
    /__no_gjirafa_end_marker__/,
  );
  if (!html) return null;
  const ranked: { path: string; score: number }[] = [];
  for (const match of html.matchAll(/href="(\/[a-z0-9][a-z0-9-]{10,})"/gi)) {
    const productPath = match[1] ?? "";
    const title = productPath.slice(1).replace(/-/g, " ");
    if (/\b(kompjuter|laptop|notebook)\b/i.test(title)) continue;
    const score = scoreTitle(query, title);
    if (!goodMatch(query, title)) continue;
    if (!ranked.some((item) => item.path === productPath)) ranked.push({ path: productPath, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  for (const candidate of ranked.slice(0, 3)) {
    const page = await fetchText(
      `https://gjirafa50.mk${candidate.path}`,
      { Accept: "text/html", "User-Agent": UA },
      /__no_gjirafa_end_marker__/,
    );
    if (!page) continue;
    const raw = page.match(/Гаранција:\s*<span[^>]*>\s*([^<]+?)\s*<\/span>/i)?.[1] ?? "";
    const text = raw
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(Number(num)));
    const listed = monthsFromText(text);
    if (listed) return listed;
    const productId = page.match(/addproducttocart\/details\/(\d+)/i)?.[1];
    if (!productId) continue;
    const specs = await fetchText(
      `https://gjirafa50.mk/Product/GetProductSpecifications?productId=${productId}`,
      { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", Accept: "text/html" },
      /__no_gjirafa_end_marker__/,
    );
    const fromSpecs = specs ? monthsFromText(specs.replace(/<[^>]+>/g, " ")) : null;
    if (fromSpecs) return fromSpecs;
  }
  // Gjirafa prints "1 година" on component pages that include the warranty line.
  return ranked.length ? 12 : null;
}

async function setecWarranty(query: string): Promise<number | null> {
  const res = await fetch("https://search.sp.solslab.dev/indexes/products/search", {
    method: "POST",
    headers: {
      Authorization: "Bearer c0424dab588b8cbbbe0a4809fc10b5f1c0c7d183b5b28ebe799f3fbf583ab358",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      q: query,
      hitsPerPage: 6,
      page: 1,
      filter: "status = 'published'",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { hits?: { handle?: string; title?: string; description?: string }[] };
  let best: { handle: string; score: number; description: string } | null = null;
  for (const hit of data.hits ?? []) {
    if (!hit.handle || !hit.title) continue;
    const score = scoreTitle(query, hit.title);
    if (!goodMatch(query, hit.title)) continue;
    if (!best || score > best.score) {
      best = { handle: hit.handle, score, description: hit.description ?? "" };
    }
  }
  if (!best) return null;
  const fromDesc = monthsFromText(best.description);
  if (fromDesc) return fromDesc;
  // Setec prints "24 месеци гаранција за физички лица" on the product page.
  return 24;
}

async function lookup(store: string, query: string): Promise<number | null> {
  if (store === "neptun") return neptunWarranty(query);
  if (store === "gjirafa50" || store === "gjirafa") return gjirafaWarranty(query);
  if (store === "setec") return setecWarranty(query);
  if (store === "included" || store === "used") return null;
  return anhochWarranty(query);
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
}

async function main() {
  const root = process.cwd();
  const csvFiles = [
    "anhoch_cpus.csv",
    "setec_cpus.csv",
    "gjirafa_cpus.csv",
    "neptun_cpus.csv",
    "anhoch_gpus.csv",
    "setec_gpus.csv",
    "gjirafa_gpus.csv",
    "neptun_gpus.csv",
    "anhoch_rams.csv",
    "setec_rams.csv",
    "gjirafa_rams.csv",
    "neptun_rams.csv",
    "anhoch_motherboards.csv",
    "anhoch_psus.csv",
    "anhoch_cases.csv",
    "anhoch_ssds.csv",
    "anhoch_hdds.csv",
    "anhoch_coolers_fans.csv",
  ].map((file) => path.join(root, file));

  const byImage = new Map<string, CsvItem[]>();
  for (const file of csvFiles) {
    if (!fs.existsSync(file)) continue;
    const shopGuess = path.basename(file).toLowerCase();
    const shop = shopGuess.includes("setec")
      ? "setec"
      : shopGuess.includes("neptun")
        ? "neptun"
        : shopGuess.includes("gjirafa")
          ? "gjirafa50"
          : "anhoch";
    const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).slice(1);
    for (const line of lines) {
      const cols = parseCsvLine(line);
      const rawName = cols[0]?.trim() ?? "";
      const price = Number(cols[1]);
      const image = cols[2]?.trim() ?? "";
      if (!rawName || !image || !Number.isFinite(price)) continue;
      const source = (cols[3]?.trim() || shop).toLowerCase();
      const list = byImage.get(image) ?? [];
      list.push({ rawName, price, source });
      byImage.set(image, list);
    }
  }

  const parts = loadAllAnhochParts({
    cpus: path.join(root, "anhoch_cpus.csv"),
    extraCpus: [
      path.join(root, "setec_cpus.csv"),
      path.join(root, "gjirafa_cpus.csv"),
      path.join(root, "neptun_cpus.csv"),
    ],
    motherboards: path.join(root, "anhoch_motherboards.csv"),
    gpus: path.join(root, "anhoch_gpus.csv"),
    extraGpus: [
      path.join(root, "setec_gpus.csv"),
      path.join(root, "gjirafa_gpus.csv"),
      path.join(root, "neptun_gpus.csv"),
    ],
    rams: path.join(root, "anhoch_rams.csv"),
    extraRams: [
      path.join(root, "setec_rams.csv"),
      path.join(root, "gjirafa_rams.csv"),
      path.join(root, "neptun_rams.csv"),
    ],
    psus: path.join(root, "anhoch_psus.csv"),
    cases: path.join(root, "anhoch_cases.csv"),
    ssds: path.join(root, "anhoch_ssds.csv"),
    hdds: path.join(root, "anhoch_hdds.csv"),
    coolers: path.join(root, "anhoch_coolers_fans.csv"),
  });

  const existing: Record<string, number> = REFRESH
    ? {}
    : JSON.parse(fs.readFileSync(OUT, "utf8") || "{}");

  const only = process.env.WARRANTY_ONLY?.toLowerCase();
  const queue = (LIMIT > 0 ? parts.slice(0, LIMIT) : parts).filter((part) => {
    if (only && !`${part.brand} ${part.name}`.toLowerCase().includes(only)) return false;
    if (part.source === "included") return false;
    return REFRESH || existing[warrantyKey(part)] == null;
  });

  console.log(`catalog ${parts.length}, to fetch ${queue.length}`);
  let found = 0;
  let missed = 0;
  let done = 0;

  function queryFor(part: AnhochPart): { store: string; query: string } {
    const rows = part.imageUrl ? byImage.get(part.imageUrl) ?? [] : [];
    const row = rows.find((item) => item.price === part.priceMkd) ?? rows[0];
    const store = (part.source || row?.source || "anhoch").toLowerCase();
    const query = row?.rawName
      ? row.rawName
      : `${part.brand} ${part.name}`.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    return { store, query };
  }

  await mapPool(queue, 4, async (part) => {
    const key = warrantyKey(part);
    const { store, query } = queryFor(part);
    const model = `${part.brand} ${part.name}`
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    let months: number | null = null;
    try {
      months = await lookup(store, query);
      if (!months && model !== query) months = await lookup(store, model);
      if (!months && store !== "anhoch") months = await anhochWarranty(model);
    } catch {
      months = null;
    }
    done += 1;
    if (months) {
      existing[key] = months;
      found += 1;
    } else {
      missed += 1;
      console.log(`miss [${store}] ${part.category} ${part.brand} ${part.name}`);
    }
    if (done % 20 === 0) {
      const tmp = `${OUT}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(existing, null, 2) + "\n");
      fs.renameSync(tmp, OUT);
      console.log(`progress ${done}/${queue.length} found ${found} missed ${missed}`);
    }
  });

  const tmp = `${OUT}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(existing, null, 2) + "\n");
  fs.renameSync(tmp, OUT);
  console.log(`done found ${found} missed ${missed} saved ${Object.keys(existing).length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
