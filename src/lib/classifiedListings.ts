import { Impit } from "impit";
import { prisma } from "@/lib/db";
import { FALLBACK_RATES } from "@/lib/currency";

/** Ads older than this are not shown and are marked expired on the next sync. */
export const CLASSIFIED_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const browser = new Impit({ browser: "chrome", timeout: 20000 });

const BUILDER_CATEGORIES = ["CPU", "COOLER", "MOTHERBOARD", "RAM", "GPU", "PSU", "CASE", "SSD"] as const;
type PartCategory = (typeof BUILDER_CATEGORIES)[number];
type PageHint = PartCategory | "DISK" | "CPU_COOLER";

export type ClassifiedDraft = {
  source: "reklama5" | "pazar3";
  externalId: string;
  url: string;
  name: string;
  category: PartCategory;
  description: string;
  priceMkd: number;
  imageUrl: string;
  city: string;
  postedAt: Date;
};

export type ClassifiedRefreshResult = {
  added: number;
  updated: number;
  expired: number;
  checked: number;
  reklama5: number;
  pazar3: number;
};

const SOURCE_LABEL: Record<ClassifiedDraft["source"], string> = {
  reklama5: "Reklama5",
  pazar3: "Pazar3",
};

export function classifiedSourceLabel(source: string): string {
  if (source === "reklama5" || source === "pazar3") return SOURCE_LABEL[source];
  return source;
}

const MONTHS: { key: string; month: number }[] = [
  { key: "септ", month: 8 },
  { key: "sept", month: 8 },
  { key: "јан", month: 0 },
  { key: "jan", month: 0 },
  { key: "фев", month: 1 },
  { key: "feb", month: 1 },
  { key: "мар", month: 2 },
  { key: "mar", month: 2 },
  { key: "апр", month: 3 },
  { key: "apr", month: 3 },
  { key: "мај", month: 4 },
  { key: "маj", month: 4 },
  { key: "maj", month: 4 },
  { key: "јун", month: 5 },
  { key: "jun", month: 5 },
  { key: "јул", month: 6 },
  { key: "jul", month: 6 },
  { key: "авг", month: 7 },
  { key: "avg", month: 7 },
  { key: "aug", month: 7 },
  { key: "сеп", month: 8 },
  { key: "sep", month: 8 },
  { key: "окт", month: 9 },
  { key: "okt", month: 9 },
  { key: "oct", month: 9 },
  { key: "ное", month: 10 },
  { key: "noe", month: 10 },
  { key: "nov", month: 10 },
  { key: "дек", month: 11 },
  { key: "dek", month: 11 },
  { key: "dec", month: 11 },
];

function decodeHtml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(Number(num)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function plain(html: string): string {
  return decodeHtml(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function absUrl(raw: string, origin: string): string {
  const value = raw.trim().replace(/^\/\//, "https://");
  if (!value || /pixel\.gif|spacer|blank/i.test(value)) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return `${origin}${value}`;
  return "";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

function skopjeDate(year: number, monthIndex: number, day: number, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(year, monthIndex, day, hour, minute));
  return new Date(guess.getTime() - zoneOffsetMs(guess, "Europe/Skopje"));
}

/** Listing clocks on Reklama5 and Pazar3, interpreted in Macedonia. */
export function parsePostedAt(raw: string, now = new Date()): Date | null {
  const text = plain(raw).toLowerCase();
  if (!text) return null;
  const clock = text.match(/(\d{1,2}):(\d{2})/);
  const hour = clock ? Number(clock[1]) : 12;
  const minute = clock ? Number(clock[2]) : 0;
  if (hour > 23 || minute > 59) return null;

  const todayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Skopje",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const today = Object.fromEntries(todayParts.map((part) => [part.type, part.value]));
  const year = Number(today.year);
  const month = Number(today.month) - 1;
  const day = Number(today.day);

  if (/(?:^|\s)(денес|denes|today|sot)(?:\s|$)/.test(text)) return skopjeDate(year, month, day, hour, minute);
  if (/(?:^|\s)(вчера|vchera|yesterday|dje)(?:\s|$)/.test(text)) {
    const yesterday = new Date(Date.UTC(year, month, day - 1));
    return skopjeDate(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), hour, minute);
  }

  const match = text.match(/(\d{1,2})\s*([a-zа-яј.]+)/i);
  if (!match) return null;
  const dayNum = Number(match[1]);
  if (dayNum < 1 || dayNum > 31) return null;
  const token = match[2].replace(/\./g, "");
  const found = MONTHS.find((row) => token.startsWith(row.key));
  if (!found) return null;
  let posted = skopjeDate(year, found.month, dayNum, hour, minute);
  if (posted.getTime() > now.getTime() + 2 * 24 * 60 * 60 * 1000) {
    posted = skopjeDate(year - 1, found.month, dayNum, hour, minute);
  }
  return Number.isNaN(posted.getTime()) ? null : posted;
}

export function classifiedCutoff(now = Date.now()): Date {
  return new Date(now - CLASSIFIED_MAX_AGE_MS);
}

function parsePriceMkd(raw: string): number {
  const text = plain(raw);
  if (!text || /договор|по договор|negotiable only/i.test(text) && !/\d/.test(text)) return 0;
  const eur = /eur|€|еур/i.test(text);
  const match = text.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[.,](\d{1,2}))?/);
  if (!match) return 0;
  const whole = match[1].replace(/[.\s]/g, "");
  const frac = match[2];
  let value = Number(whole);
  if (frac && frac.length < 3 && !/^\d{1,3}(?:[.\s]\d{3})+$/.test(match[1])) {
    value = Number(`${whole}.${frac}`);
  }
  if (!Number.isFinite(value) || value <= 0) return 0;
  const mkd = eur ? Math.round(value * FALLBACK_RATES.EUR) : Math.round(value);
  if (mkd < 150 || mkd > 300_000) return 0;
  return mkd;
}

function isWantAd(title: string): boolean {
  return /(^|[^\p{L}\p{N}])(купувам\w*|kupuvam\w*|купуваме\w*|барам\w*|baram\w*|откуп\w*|otkup\w*|се\s+купува|se\s+kupuva)/iu.test(
    title,
  );
}

function isLaptopMemory(text: string): boolean {
  return /so-?\s?dimm|sodimm|лаптоп|laptop|notebook|за\s+лаптоп|za\s+laptop/i.test(text);
}

function signals(text: string): PartCategory[] {
  const hits: PartCategory[] = [];
  if (
    /\b(?:rtx|gtx)\s?\d{3,4}(?:\s*(?:ti|super))?/i.test(text) ||
    /\brx\s?\d{3,4}(?:\s*(?:xt|gre))?/i.test(text) ||
    /\b(?:geforce|radeon)\b/i.test(text) ||
    /графич\w*|grafi[cč]k\w*|grafick\w*/i.test(text)
  ) {
    hits.push("GPU");
  }
  if (
    /\b(ryzen|threadripper|xeon|pentium|celeron|phenom|core\s*2|процесор\w*|procesor\w*|i[3579]\s*-?\s*\d{3,5})\b/i.test(
      text,
    )
  ) {
    hits.push("CPU");
  }
  if (/\b(ddr\s*-?\s*[2-5]|\bram\b|рам\b|мемори\w*|memorij\w*)\b/i.test(text)) hits.push("RAM");
  if (
    /\b(motherboard|матичн\w*|mati[cč]n\w*|matichn\w*|mbo\b)\b/i.test(text) ||
    /\b(?:x870e|x870|b850|b650e|b650|a620|x570|b550|a520|b450|a320|z890|b860|z790|b760|z690|b660|h610|z590|b560|h510)(?![0-9])/i.test(
      text,
    )
  ) {
    hits.push("MOTHERBOARD");
  }
  if (
    /\b(psu|напојув\w*|napojuv\w*|napajanj\w*|power\s*supply|80\s*\+)\b/i.test(text) ||
    (/\b\d{3,4}\s*w\b/i.test(text) && /\b(atx|sfx)\b/i.test(text))
  ) {
    hits.push("PSU");
  }
  if (/\b(куќиш\w*|kukjist\w*|kukist\w*|ku[cć]i[sš]t\w*|pc\s*case|mid[\s-]?tower|full[\s-]?tower)\b/i.test(text)) {
    hits.push("CASE");
  }
  if (/\b(ssd|nvme|m\.2)\b/i.test(text)) hits.push("SSD");
  if (/\b(cooler|кулер\w*|kuler\w*|ладилник\w*|ladilnik\w*|\baio\b|noctua|воден\w*\s+ладе\w*)\b/i.test(text)) {
    hits.push("COOLER");
  }
  return hits;
}

function resolveCategory(title: string, extra: string, hint: PageHint | null): PartCategory | null {
  if (isWantAd(title)) return null;
  if (/\b(neisprav\w*|неисправ\w*|za\s+delovi|за\s+делови|defekt\w*)\b/i.test(title)) return null;
  if (/полуконфигурац|polukonfig|\bcombo\b/i.test(title)) return null;
  const text = `${title} ${extra}`;
  let hits = signals(text);
  if (hits.includes("CPU") && hits.includes("COOLER")) {
    const without = text.replace(/со\s+кулер\w*|so\s+kuler\w*|with\s+(?:a\s+)?cooler|вклучен\s+кулер\w*/gi, " ");
    if (!/\b(cooler|кулер\w*|kuler\w*|ладилник|ladilnik|noctua|\baio\b)\b/i.test(without)) {
      hits = hits.filter((hit) => hit !== "COOLER");
    }
  }
  if (isLaptopMemory(title)) hits = hits.filter((hit) => hit !== "RAM");
  if (hits.includes("SSD") && /\bhdd\b|хард\s*диск|hard\s*disk/i.test(text) && !/\bssd\b|\bnvme\b|\bm\.2\b/i.test(text)) {
    hits = hits.filter((hit) => hit !== "SSD");
  }
  if (hits.length > 1) return null;
  if (hits.length === 1) {
    if (hint === "DISK" && hits[0] !== "SSD") return null;
    if (hint === "CPU_COOLER" && hits[0] !== "CPU" && hits[0] !== "COOLER") return null;
    return hits[0];
  }
  if (hint === "DISK" || hint === "CPU_COOLER" || !hint) return null;
  if (hint === "RAM" && isLaptopMemory(title)) return null;
  return hint;
}

function hintFromLabel(label: string): PageHint | null {
  const text = label.toLowerCase();
  if (/рам|ram/.test(text)) return "RAM";
  if (/графич|grafick/.test(text)) return "GPU";
  if (/матич|matic/.test(text)) return "MOTHERBOARD";
  if (/куќиш|kukj|kuci/.test(text)) return "CASE";
  if (/напојув|napoj/.test(text)) return "PSU";
  if (/хард|disk|ssd/.test(text)) return "DISK";
  if (/процесор|кулер|cooler|procesor/.test(text)) return "CPU_COOLER";
  return null;
}

type PageScan = {
  ads: ClassifiedDraft[];
  oldest: Date | null;
  dated: number;
};

function considerDate(scan: { oldest: Date | null; dated: number }, postedAt: Date | null) {
  if (!postedAt) return;
  scan.dated += 1;
  if (!scan.oldest || postedAt < scan.oldest) scan.oldest = postedAt;
}

function parseReklama5Page(html: string, pageHint: PageHint): PageScan {
  const scan: PageScan = { ads: [], oldest: null, dated: 0 };
  const blocks = html.split('class="row ad-top-div').slice(1);
  for (const block of blocks) {
    const externalId = block.match(/AdDetails\?ad=(\d+)/)?.[1] ?? block.match(/data-adid="(\d+)"/)?.[1] ?? "";
    const name = plain(block.match(/class="SearchAdTitle">([^<]+)/)?.[1] ?? "");
    const dateChunk = block.match(/ad-date-div-1[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
    const postedAt = parsePostedAt(plain(dateChunk));
    considerDate(scan, postedAt);
    if (!externalId || name.length < 2 || !postedAt) continue;
    const subLabel = [...block.matchAll(/<small>([^<]+)<\/small>/g)].map((match) => plain(match[1])).pop() ?? "";
    const hint = hintFromLabel(subLabel) ?? pageHint;
    const description = plain(block.match(/class="searchAdDesc">([\s\S]*?)<\/p>/)?.[1] ?? "");
    const category = resolveCategory(name, description, hint);
    const priceMkd = parsePriceMkd(block.match(/class="search-ad-price">([\s\S]*?)<\/span>/)?.[1] ?? "");
    if (!category || !priceMkd) continue;
    const imageUrl = absUrl(block.match(/background-image:\s*url\(([^)]+)\)/)?.[1] ?? "", "https://reklama5.mk");
    const city = plain(block.match(/city-span[\s\S]{0,160}?<\/i>\s*([^<]+)/)?.[1] ?? "");
    scan.ads.push({
      source: "reklama5",
      externalId,
      url: `https://reklama5.mk/AdDetails?ad=${externalId}`,
      name: name.slice(0, 180),
      category,
      description: [description, city].filter(Boolean).join(" · ").slice(0, 400),
      priceMkd,
      imageUrl,
      city: city.slice(0, 80),
      postedAt,
    });
  }
  return scan;
}

function parsePazar3Page(html: string): PageScan {
  const scan: PageScan = { ads: [], oldest: null, dated: 0 };
  const blocks = html.split('class="new row row-listing').slice(1);
  for (const block of blocks) {
    const externalId = block.match(/data-product-id="(\d+)"/)?.[1] ?? block.match(/\/(\d{5,})(?:["'#?]|$)/)?.[1] ?? "";
    const link = block.match(/<a class="Link_vis"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
    const name = plain(link.match(/>([^<]+)<\/a>/)?.[1] ?? link.match(/title="([^"]+)"/)?.[1] ?? "");
    const postedAt = parsePostedAt(block.match(/class="pull-right[^"]*">\s*([^<]+)/)?.[1] ?? "");
    considerDate(scan, postedAt);
    if (!externalId || name.length < 2 || !postedAt) continue;
    const href = link.match(/href="([^"]+)"/)?.[1] ?? "";
    const category = resolveCategory(name, "", null);
    const url = absUrl(href, "https://www.pazar3.mk");
    const priceMkd = parsePriceMkd(block.match(/class="list-price">([\s\S]*?)<\/p>/)?.[1] ?? "");
    if (!category || !priceMkd || !url) continue;
    const imageRaw =
      block.match(/<img[^>]+src="(https:\/\/media\.pazar3\.mk[^"]+)"/)?.[1] ??
      block.match(/data-src="(https:\/\/media\.pazar3\.mk[^"]+)"/)?.[1] ??
      "";
    const city = plain(
      [...block.matchAll(/href="\/oglasi\/[^"]+">([^<]+)<\/a>/g)]
        .map((match) => plain(match[1]))
        .filter((label) => label && !/делови за компјутери/i.test(label))
        .slice(0, 2)
        .join(" "),
    );
    scan.ads.push({
      source: "pazar3",
      externalId,
      url,
      name: name.slice(0, 180),
      category,
      description: "",
      priceMkd,
      imageUrl: imageRaw.split("?")[0] ?? "",
      city: city.slice(0, 80),
      postedAt,
    });
  }
  return scan;
}

async function fetchHtml(url: string): Promise<string> {
  let res: Awaited<ReturnType<typeof browser.fetch>> | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await browser.fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "mk-MK,mk;q=0.9,en;q=0.8",
      },
    });
    if (res.ok || (res.status !== 403 && res.status !== 429 && res.status !== 503)) break;
    await sleep(400 * attempt);
  }
  if (!res || !res.ok) throw new Error(`${new URL(url).hostname} HTTP ${res?.status ?? 0}`);
  const html = await res.text();
  const hasListings = /SearchAdTitle|row-listing/.test(html);
  if (!hasListings && (/Just a moment|cf-browser-verification|challenge-platform/i.test(html) || html.length < 8000)) {
    throw new Error(`${new URL(url).hostname} blocked the listing request`);
  }
  return html;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectPages(
  source: ClassifiedDraft["source"],
  pages: number,
  load: (page: number) => Promise<PageScan>,
): Promise<ClassifiedDraft[]> {
  const cutoff = classifiedCutoff().getTime();
  const seen = new Set<string>();
  const out: ClassifiedDraft[] = [];
  for (let page = 1; page <= pages; page++) {
    const scan = await load(page);
    if (!scan.dated) break;
    for (const ad of scan.ads) {
      if (ad.postedAt.getTime() < cutoff || seen.has(ad.externalId)) continue;
      seen.add(ad.externalId);
      out.push(ad);
    }
    if (scan.oldest && scan.oldest.getTime() < cutoff) break;
    if (page < pages) await sleep(source === "reklama5" ? 200 : 250);
  }
  return out;
}

const REKLAMA5_PAGES: { subcat: string; hint: PageHint }[] = [
  { subcat: "606", hint: "CPU_COOLER" },
  { subcat: "608", hint: "GPU" },
  { subcat: "605", hint: "MOTHERBOARD" },
  { subcat: "607", hint: "RAM" },
  { subcat: "616", hint: "PSU" },
  { subcat: "604", hint: "CASE" },
  { subcat: "609", hint: "DISK" },
];

async function fetchReklama5(): Promise<ClassifiedDraft[]> {
  const groups = await mapPool(REKLAMA5_PAGES, 3, async (entry) =>
    collectPages("reklama5", 4, async (page) => {
      const url = `https://reklama5.mk/Search?cat=584&pageView=1&subcat=${entry.subcat}&page=${page}&SortByPrice=2`;
      return parseReklama5Page(await fetchHtml(url), entry.hint);
    }),
  );
  const seen = new Set<string>();
  const ads: ClassifiedDraft[] = [];
  for (const group of groups) {
    for (const ad of group) {
      if (seen.has(ad.externalId)) continue;
      seen.add(ad.externalId);
      ads.push(ad);
    }
  }
  return ads;
}

async function fetchPazar3(): Promise<ClassifiedDraft[]> {
  return collectPages("pazar3", 4, async (page) => {
    const url = `https://www.pazar3.mk/oglasi/elektronika/delovi-za-kompjuteri-dodatoci?Page=${page}`;
    return parsePazar3Page(await fetchHtml(url));
  });
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

export async function loadClassifiedDrafts(): Promise<{
  reklama5: ClassifiedDraft[];
  pazar3: ClassifiedDraft[];
}> {
  const [reklama5, pazar3] = await Promise.all([fetchReklama5(), fetchPazar3()]);
  return { reklama5, pazar3 };
}

let refreshInFlight: Promise<ClassifiedRefreshResult> | null = null;

/** Pull both classified sites and keep only ads posted in the last 14 days. */
export function refreshClassifiedListings(): Promise<ClassifiedRefreshResult> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = syncClassifiedListings().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function syncClassifiedListings(): Promise<ClassifiedRefreshResult> {
  const [reklama5, pazar3] = await Promise.all([fetchReklama5(), fetchPazar3()]);
  if (!reklama5.length || !pazar3.length) {
    throw new Error("Classified sync looked empty, so nothing was changed.");
  }
  const fresh = [...reklama5, ...pazar3];
  const cutoff = classifiedCutoff();
  let added = 0;
  let updated = 0;
  let expired = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const source of ["reklama5", "pazar3"] as const) {
        const incoming = fresh.filter((ad) => ad.source === source);
        const existing = await tx.classifiedListing.findMany({
          where: { source },
          select: { id: true, externalId: true, status: true },
        });
        const byExternal = new Map(existing.map((row) => [row.externalId, row]));
        const seen = new Set<string>();
        for (const ad of incoming) {
          seen.add(ad.externalId);
          const prev = byExternal.get(ad.externalId);
          const data = {
            url: ad.url,
            name: ad.name,
            category: ad.category,
            description: ad.description,
            priceMkd: ad.priceMkd,
            imageUrl: ad.imageUrl || null,
            city: ad.city,
            postedAt: ad.postedAt,
          };
          if (!prev) {
            await tx.classifiedListing.create({
              data: { source, externalId: ad.externalId, status: "active", ...data },
            });
            added += 1;
            continue;
          }
          await tx.classifiedListing.update({
            where: { id: prev.id },
            data: prev.status === "sold" ? data : { ...data, status: "active" },
          });
          updated += 1;
        }
        const stale = existing.filter((row) => row.status !== "sold" && !seen.has(row.externalId));
        if (stale.length) {
          await tx.classifiedListing.updateMany({
            where: { id: { in: stale.map((row) => row.id) } },
            data: { status: "expired" },
          });
          expired += stale.length;
        }
      }
      await tx.classifiedListing.updateMany({
        where: { status: "active", postedAt: { lt: cutoff } },
        data: { status: "expired" },
      });
      await tx.siteSettings.updateMany({
        where: { id: 1 },
        data: { classifiedSyncedAt: new Date() },
      });
    },
    { timeout: 60000 },
  );

  return {
    added,
    updated,
    expired,
    checked: fresh.length,
    reklama5: reklama5.length,
    pazar3: pazar3.length,
  };
}

const REFRESH_EVERY_MS = 3 * 60 * 60 * 1000;

/** Refresh in the background when the last successful sync is older than three hours. */
export async function refreshClassifiedListingsIfStale(): Promise<void> {
  const settings = await prisma.siteSettings.findUnique({
    where: { id: 1 },
    select: { classifiedSyncedAt: true },
  });
  const syncedAt = settings?.classifiedSyncedAt?.getTime() ?? 0;
  if (Date.now() - syncedAt < REFRESH_EVERY_MS) return;
  await refreshClassifiedListings();
}
