import fs from "fs";
import { PartCategory } from "../src/generated/prisma";
import { resolveStoreId } from "../src/lib/partStores";

export type AnhochCpuPart = {
  name: string;
  brand: string;
  category: typeof PartCategory.CPU;
  priceMkd: number;
  stock: number;
  socket: string;
  tdpWatts: number;
  /** True when retail packaging includes a stock cooler/fan. */
  includesCooler: boolean;
  imageUrl: string;
  source: string;
};

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

function estimateTdp(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("athlon")) return 35;
  if (n.includes("3200g") || n.includes("1200")) return 65;
  if (n.includes("x3d")) return 120;
  if (n.includes("9950") || n.includes("9900") || n.includes("7900")) return 170;
  if (n.includes("ultra") || /\bi[79]-/.test(n) || /\bkf?\b/.test(n)) return 125;
  if (/\bx\b/.test(n) || n.includes("x (")) return 105;
  return 65;
}

function inferSocket(raw: string, brand: string, modelName: string): string {
  // Prefer model generation over shop title tags (listings sometimes say AM5 on AM4 chips).
  if (brand === "AMD") {
    // Desktop Ryzen 1000–5000 (+ Athlon) → AM4; 7000/8000/9000 → AM5
    if (
      /ryzen\s*[3579]\s*[1-5]\d{3}/i.test(modelName) ||
      /athlon/i.test(modelName)
    ) {
      return "AM4";
    }
    if (/a[468]-?series|a[468]\d{3}/i.test(modelName)) return "FM2+";
    if (/ryzen\s*[3579]\s*[789]\d{3}/i.test(modelName)) return "AM5";
    const sock = raw.match(/\b(AM5|AM4)\b/i);
    if (sock) return sock[1].toUpperCase();
    return "AM5";
  }
  const sock = raw.match(/\b(AM5|AM4|LGA1700|LGA1851)\b/i);
  if (sock) return sock[1].toUpperCase();
  if (/ultra/i.test(modelName)) return "LGA1851";
  if (/i[3579]-1[01]\d{3}/i.test(modelName)) return "LGA1200";
  return "LGA1700";
}

/** Many Ryzen 5 / X / tray SKUs ship without a fan — detect from title. */
export function detectIncludesCooler(raw: string): boolean {
  const n = raw.toLowerCase();
  if (/w\/o[\s\S]*cooler|without\s+cooler|\bno\s+cooler|\bno\s+fan|\bwof\b|без\s+кулер/i.test(n)) {
    return false;
  }
  if (/wraith|w\/[\s\S]*cooler|,\s*wraith|w\s+cooler|\bwith\s+cooler|\+?\s*original\s+cooler/i.test(n)) {
    return true;
  }
  // Tray / bare / MPK chips usually without cooler unless stated
  if (/\btra(?:y)?\b|\bmpk\b|\boem\b/i.test(n)) return false;
  // Boxed retail often includes a cooler for non-X SKUs
  if (/\bbox\b/i.test(n) && !/\bx\b|\bk\b|\bkf\b|\bx3d\b/i.test(n)) return true;
  return false;
}

/** True if the CSV row looks like a desktop CPU (not cooler/paste). */
export function isCpuProductName(raw: string): boolean {
  const n = raw.toLowerCase();
  if (/thermal\s*paste|термалн|contact\s*frame|cpu\s*cooler|кулер|ладилник|ftohes|fan\s*cpu/i.test(n)) {
    // Allow real CPUs that mention cooler packaging
    if (!/\b(ryzen|core\s*i|intel\s*i|ultra\s*\d|athlon|celeron|pentium)\b/i.test(n)) return false;
  }
  return /\b(ryzen|core\s*ultra|core\s*i[3579]|intel\s*i[3579]|intel\s*core|athlon|celeron|pentium|threadripper|a[468]-?series)\b/i.test(
    raw
  ) || /^CPU\s+/i.test(raw) || /^(Procesor|Процесор)\s+/i.test(raw);
}

/** Stable key for cheapest-wins dedupe across shops. */
export function cpuDedupeKey(rawOrParsedName: string, brand: string): string {
  const s = rawOrParsedName.toLowerCase().replace(/к/g, "k");
  const ryzen = s.match(/ryzen\s*(?:threadripper\s*(?:pro)?\s*)?(\d)\s*([0-9]{3,5}\w*)/i);
  if (ryzen) return `amd|ryzen${ryzen[1]}|${ryzen[2]}`;
  const ultra = s.match(/ultra\s*([579])\s*([0-9]{3}\w*)/i);
  if (ultra) return `intel|ultra${ultra[1]}|${ultra[2]}`;
  const core = s.match(/(?:core\s*)?i([3579])[-\s]?([0-9]{4,5}\w*)/i);
  if (core) return `intel|i${core[1]}|${core[2]}`;
  const athlon = s.match(/athlon\s*([0-9]{4}\w*)/i);
  if (athlon) return `amd|athlon|${athlon[1]}`;
  const series = s.match(/a([468])(?:-?series)?\s*x?2?\s*([0-9]{4}\w*)/i);
  if (series) return `amd|a${series[1]}|${series[2]}`;
  const compact = s.replace(/[^a-z0-9]+/g, "");
  return `${brand.toLowerCase()}|${compact.slice(0, 40)}`;
}

function parseCpuName(raw: string): {
  brand: string;
  name: string;
  socket: string;
  includesCooler: boolean;
} {
  let s = raw
    .replace(/^(CPU|Procesor|Процесор)\s+/i, "")
    .replace(/К/g, "K");

  let brand = "Unknown";
  if (/\bAMD\b/i.test(s) || /\bRyzen\b|\bAthlon\b|\bA[468]-?Series\b/i.test(s)) brand = "AMD";
  else if (/\bIntel\b/i.test(s) || /\bCore\b|\bCeleron\b|\bPentium\b|\bUltra\b/i.test(s)) brand = "Intel";

  s = s.replace(/^(AMD|Intel)\s+/i, "");
  const packaging = /\bBOX\b/i.test(s) ? "BOX" : /\bTRA(?:Y)?\b|\bOEM\b|\bMPK\b/i.test(s) ? "TRAY" : null;
  const includesCooler = detectIncludesCooler(raw);

  let name = s
    .replace(/\b(Raptor Lake|Arrow Lake|Alder Lake|Dual Edition|Anniversary Edition)\b/gi, "")
    .replace(/\b(Dual|Quad|Hexa|Octa|\d+)[-\s]?Core\b/gi, "")
    .replace(/\b\d+\s*јадра\b/gi, "")
    .replace(/\b\d+\s*нишки\b/gi, "")
    .replace(/\b[EP]?\d+(?:\.\d+)?\s*GHz\b/gi, "")
    .replace(/\b(AM5|AM4|LGA1700|LGA1851|LGA1200)\b/gi, "")
    .replace(/\b\d+\s*MB(?:\s*кеш|\s*Cache)?\b/gi, "")
    .replace(/\(\s*\d+\s*nm\s*\)/gi, "")
    .replace(/\b(BOX|TRAY|TRA|OEM|MPK)\b/gi, "")
    .replace(/\bno\s+fan\b/gi, "")
    .replace(/\bno\s+cooler\b/gi, "")
    .replace(/\bw\/o\b[\s\S]*$/i, "")
    .replace(/\bw\/[\s\S]*$/i, "")
    .replace(/\bw\s+Cooler[\s\S]*$/i, "")
    .replace(/\boriginal\s+cooler\b/gi, "")
    .replace(/,/g, " ")
    .replace(/\//g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Prefer canonical "Ryzen 5 5500" / "Core i5-14400F" style when possible
  const ryzen = raw.match(/Ryzen\s*(?:Threadripper\s*(?:Pro)?\s*)?\d\s*[0-9]{3,5}\w*/i);
  const ultra = raw.match(/Core\s*Ultra\s*[579]\s*[0-9]{3}\w*/i);
  const core = raw.match(/Core\s*i[3579][-\s]?[0-9]{4,5}\w*/i) || raw.match(/\bi([3579])[-\s]?([0-9]{4,5}\w*)/i);
  if (ryzen) name = ryzen[0].replace(/\s+/g, " ").trim();
  else if (ultra) name = ultra[0].replace(/\s+/g, " ").trim();
  else if (core) {
    if (core[0].toLowerCase().startsWith("core")) name = core[0].replace(/\s+/g, " ").replace(/i([3579])\s+/, "i$1-").trim();
    else name = `Core i${core[1]}-${core[2]}`;
  }

  const coolerTag = includesCooler ? "stock cooler" : "no cooler";
  if (packaging) name = `${name} (${packaging} · ${coolerTag})`;
  else name = `${name} (${coolerTag})`;

  const socket = inferSocket(raw, brand, name);
  return { brand, name, socket, includesCooler };
}

/** Load CPUs from any shop CSV (Anhoch / Setec / Gjirafa / Neptun). */
export function loadAnhochCpus(csvPath: string): AnhochCpuPart[] {
  if (!fs.existsSync(csvPath)) return [];
  const text = fs.readFileSync(csvPath, "utf8");
  const lines = text.trim().split(/\r?\n/).slice(1);
  const parts: AnhochCpuPart[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    const rawName = cols[0]?.trim();
    const priceStr = cols[1];
    const imageUrl = cols[2];
    if (!rawName || !isCpuProductName(rawName)) continue;
    const priceMkd = Number(priceStr);
    if (!Number.isFinite(priceMkd)) continue;

    const { brand, name, socket, includesCooler } = parseCpuName(rawName);
    if (brand === "Unknown") continue;

    const inStockFlag = [cols[4], cols[3], cols[cols.length - 1]]
      .map((c) => (c ?? "").trim().toLowerCase())
      .find((v) => v === "yes" || v === "no" || v === "да" || v === "не" || v === "da" || v === "ne");
    const stock =
      inStockFlag === "no" || inStockFlag === "не" || inStockFlag === "ne" ? 0 : 8;

    parts.push({
      name,
      brand,
      category: PartCategory.CPU,
      priceMkd,
      stock,
      socket,
      tdpWatts: estimateTdp(name),
      includesCooler,
      imageUrl: imageUrl?.trim() || "",
      source: resolveStoreId({
        source: cols[3],
        imageUrl: imageUrl?.trim() || "",
        csvPath,
      }),
    });
  }

  return parts;
}

/** Keep one CPU per model; prefer in-stock, then cheaper. */
export function dedupeCpusByCheapest(parts: AnhochCpuPart[]): AnhochCpuPart[] {
  const best = new Map<string, AnhochCpuPart>();
  for (const part of parts) {
    const key = cpuDedupeKey(part.name, part.brand);
    const prev = best.get(key);
    if (!prev) {
      best.set(key, part);
      continue;
    }
    const prevIn = prev.stock > 0;
    const nextIn = part.stock > 0;
    if (nextIn && !prevIn) best.set(key, part);
    else if (prevIn && !nextIn) continue;
    else if (part.priceMkd < prev.priceMkd) best.set(key, part);
  }
  return [...best.values()].sort((a, b) => a.priceMkd - b.priceMkd);
}
