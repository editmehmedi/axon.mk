import fs from "fs";
import { PartCategory } from "../src/generated/prisma";
import { parseRamKitLayout } from "../src/lib/compatibility";
import { resolveStoreId } from "../src/lib/partStores";
import {
  dedupeCpusByCheapest,
  loadAnhochCpus,
  type AnhochCpuPart,
} from "./anhochCpus";

export type AnhochPart = {
  name: string;
  brand: string;
  category: PartCategory;
  priceMkd: number;
  stock: number;
  socket?: string;
  ramType?: string;
  wattage?: number;
  tdpWatts?: number;
  formFactor?: string;
  includesCooler?: boolean;
  imageUrl: string;
  source: string;
};

/** Free virtual cooler for CPUs that ship with a stock fan. */
export const STOCK_COOLER_PART: AnhochPart = {
  name: "Included stock cooler",
  brand: "OEM",
  category: PartCategory.COOLER,
  priceMkd: 0,
  stock: 99,
  tdpWatts: 65,
  imageUrl: "",
  source: "included",
};

export function isStockCoolerPart(part: { brand?: string | null; name?: string | null }): boolean {
  return part.brand === "OEM" && /included stock cooler/i.test(part.name ?? "");
}

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

type CsvRow = {
  name: string;
  priceMkd: number;
  imageUrl: string;
  /** From CSV in_stock (yes/no). Out of stock → 0. */
  stock: number;
  source: string;
};

/** Parse in_stock from Anhoch (col3) or Setec/Gjirafa/Neptun (col4). */
function stockFromCsvCols(cols: string[], defaultStock: number): number {
  const candidates = [cols[4], cols[3], cols[cols.length - 1]];
  for (const c of candidates) {
    const v = (c ?? "").trim().toLowerCase();
    if (v === "yes" || v === "да" || v === "da") return defaultStock;
    if (v === "no" || v === "не" || v === "ne") return 0;
  }
  return defaultStock;
}

function readCsvRows(csvPath: string, defaultStock = 6): CsvRow[] {
  if (!fs.existsSync(csvPath)) return [];
  const text = fs.readFileSync(csvPath, "utf8");
  const lines = text.trim().split(/\r?\n/).slice(1);
  const rows: CsvRow[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    const rawName = cols[0];
    const priceStr = cols[1];
    const imageUrl = cols[2];
    if (!rawName?.trim()) continue;
    const priceMkd = Number(priceStr);
    if (!Number.isFinite(priceMkd)) continue;
    const url = imageUrl?.trim() || "";
    rows.push({
      name: rawName.trim(),
      priceMkd,
      imageUrl: url,
      stock: stockFromCsvCols(cols, defaultStock),
      source: resolveStoreId({
        source: cols[3],
        imageUrl: url,
        csvPath,
      }),
    });
  }
  return rows;
}

function cleanSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const KNOWN_BRANDS = [
  "Cooler Master",
  "Thermal Grizzly",
  "Western Digital",
  "White Shark",
  "Thermaltake",
  "SilverStone",
  "be quiet!",
  "Gigabyte",
  "Sapphire",
  "Kingston",
  "Corsair",
  "Deepcool",
  "Sharkoon",
  "Seasonic",
  "Fractal",
  "Lian Li",
  "Noctua",
  "Arctic",
  "Samsung",
  "Verbatim",
  "Seagate",
  "Patriot",
  "Innovation",
  "Netac",
  "ADATA",
  "Crucial",
  "Matrix",
  "Phanteks",
  "Montech",
  "Chieftec",
  "Cougar",
  "Antec",
  "NZXT",
  "ASUS",
  "ASRock",
  "MSI",
  "WD",
  "SAMA",
  "SBOX",
  "Fury",
  "G.Skill",
  "TeamGroup",
  "Pny",
  "PNY",
  "Inno3D",
  "Palit",
  "Zotac",
  "XFX",
  "PowerColor",
  "AFOX",
  "Manli",
  "EVGA",
  "KFA2",
  "Intel",
  "AMD",
  "Acer",
  "Biostar",
  "Hiksemi",
  "J&A",
  "IMRO",
];

function extractBrand(text: string, fallback = "Unknown"): string {
  for (const b of KNOWN_BRANDS) {
    const re = new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) return normalizeBrand(b);
  }
  const first = text.split(/\s+/)[0];
  return first ? normalizeBrand(first) : fallback;
}

function normalizeBrand(raw: string): string {
  const map: Record<string, string> = {
    gigabyte: "Gigabyte",
    msi: "MSI",
    asus: "ASUS",
    asrock: "ASRock",
    sapphire: "Sapphire",
    deepcool: "Deepcool",
    kingston: "Kingston",
    corsair: "Corsair",
    netac: "Netac",
    patriot: "Patriot",
    adata: "ADATA",
    samsung: "Samsung",
    verbatim: "Verbatim",
    seagate: "Seagate",
    "western digital": "WD",
    wd: "WD",
    thermaltake: "Thermaltake",
    seasonic: "Seasonic",
    sharkoon: "Sharkoon",
    matrix: "Matrix",
    coolermaster: "Cooler Master",
    "cooler master": "Cooler Master",
    noctua: "Noctua",
    arctic: "Arctic",
    nzxt: "NZXT",
    fractal: "Fractal",
    "lian li": "Lian Li",
    innovation: "Innovation",
    crucial: "Crucial",
    "be quiet!": "be quiet!",
    "white shark": "White Shark",
    sama: "SAMA",
    sbox: "SBOX",
    fury: "Kingston",
    afox: "AFOX",
    manli: "Manli",
    evga: "EVGA",
    kfa2: "KFA2",
    inno3d: "Inno3D",
  };
  const key = raw.toLowerCase();
  return map[key] ?? raw;
}

/** Motherboards */
export function loadAnhochMotherboards(csvPath: string): AnhochPart[] {
  return readCsvRows(csvPath, 6)
    .filter((r) => /^MB\s+/i.test(r.name))
    .map((r) => {
      const raw = r.name.replace(/^MB\s+/i, "");
      const brandMatch = raw.match(/^(Gigabyte|MSI|ASUS|ASRock|Biostar|ASRock)/i);
      const brand = normalizeBrand(brandMatch?.[1] ?? extractBrand(raw));
      const socket =
        raw.match(/\b(AM5|AM4|LGA1851|LGA1700|LGA1200|LGA1151|LGA1150|LGA1155)\b/i)?.[1]?.toUpperCase() ?? null;
      let ramType: string | null = /\bDDR5\b/i.test(raw)
        ? "DDR5"
        : /\bDDR4\b/i.test(raw)
          ? "DDR4"
          : /\bDDR3\b/i.test(raw)
            ? "DDR3"
            : null;
      if (!ramType && socket) {
        const s = socket.toUpperCase();
        if (s === "AM5" || s === "LGA1851") ramType = "DDR5";
        else if (s === "AM4" || s === "LGA1200" || s === "LGA1151") ramType = "DDR4";
        else if (s === "LGA1150" || s === "LGA1155" || s === "FM2+") ramType = "DDR3";
      }
      const chipset = raw.match(/\b([A-Z]?\d{3,4}[A-Z]*(?:M)?)\b/);
      const isMatx =
        /\bMicro\b/i.test(raw) ||
        /\bmATX\b/i.test(raw) ||
        (chipset?.[1] ? /M$/i.test(chipset[1]) : false) ||
        /\bB\d{3}M\b|\bH\d{3}M\b|\bA\d{3}M\b/i.test(raw);
      const isItx = /\bITX\b|\bMini[\s-]?ITX\b/i.test(raw);
      const formFactor = isItx ? "ITX" : isMatx ? "mATX" : "ATX";

      let name = raw
        .replace(/^(Gigabyte|MSI|ASUS|ASRock|Biostar)\s+/i, "")
        .replace(/\b(AM5|AM4|LGA1851|LGA1700|LGA1200|LGA1151)\b/gi, "")
        .replace(/\bDDR[45]\b/gi, "")
        .replace(/\b\d{4,5}MHz(?:\s*OC)?\b/gi, "")
        .replace(/\bX3D\b/gi, "")
        .replace(/\//g, " ")
        .replace(/,/g, " ");
      name = cleanSpaces(name);
      // Keep chipset + board model roughly: take first ~6 tokens
      const tokens = name.split(" ").filter(Boolean);
      name = tokens.slice(0, 6).join(" ");

      return {
        name,
        brand,
        category: PartCategory.MOTHERBOARD,
        priceMkd: r.priceMkd,
        stock: r.stock,
        socket: socket ?? undefined,
        ramType: ramType ?? undefined,
        formFactor,
        imageUrl: r.imageUrl,
        source: r.source,
      };
    })
    .filter((p) => p.socket && p.ramType);
}

function estimateGpuTdp(name: string): number {
  const n = name.toLowerCase();
  if (/gt\s*710|gt710/.test(n)) return 19;
  if (/gt\s*730|gt730/.test(n)) return 25;
  if (/gt\s*740|gt740/.test(n)) return 64;
  if (/gtx\s*1050\s*ti|gtx1050\s*ti/.test(n)) return 75;
  if (/gtx\s*1630|gtx1630/.test(n)) return 75;
  if (/gtx\s*1660\s*ti|gtx1660\s*ti/.test(n)) return 120;
  if (/gtx\s*1660\s*super|gtx1660\s*super/.test(n)) return 125;
  if (/rtx\s*5090/.test(n)) return 575;
  if (/rtx\s*5080/.test(n)) return 360;
  if (/rtx\s*5070\s*ti/.test(n)) return 300;
  if (/rtx\s*5070/.test(n)) return 250;
  if (/rtx\s*5060\s*ti/.test(n)) return 180;
  if (/rtx\s*5060/.test(n)) return 145;
  if (/rtx\s*5050/.test(n)) return 130;
  if (/rtx\s*4090/.test(n)) return 450;
  if (/rtx\s*4080/.test(n)) return 320;
  if (/rtx\s*4070\s*ti/.test(n)) return 285;
  if (/rtx\s*4070/.test(n)) return 200;
  if (/rtx\s*4060\s*ti/.test(n)) return 160;
  if (/rtx\s*4060/.test(n)) return 115;
  if (/rtx\s*3070/.test(n)) return 220;
  if (/rtx\s*3060/.test(n)) return 170;
  if (/rtx\s*3050/.test(n)) return 115;
  if (/rx\s*9070\s*xt/.test(n)) return 304;
  if (/rx\s*9070\s*gre/.test(n)) return 260;
  if (/rx\s*9070/.test(n)) return 220;
  if (/rx\s*9060\s*xt/.test(n)) return 160;
  if (/rx\s*7900/.test(n)) return 300;
  if (/rx\s*7800/.test(n)) return 263;
  if (/rx\s*7700/.test(n)) return 245;
  if (/rx\s*7600/.test(n)) return 165;
  if (/rx\s*6700\s*xt|rx6700\s*xt/.test(n)) return 230;
  if (/rx\s*6650\s*xt|rx6650\s*xt/.test(n)) return 180;
  if (/rx\s*6600|rx6600/.test(n)) return 132;
  if (/rx\s*6500\s*xt|rx6500\s*xt/.test(n)) return 107;
  if (/rx\s*6400|rx6400/.test(n)) return 53;
  if (/rx\s*580|rx580/.test(n)) return 185;
  if (/rx\s*5500|rx5500/.test(n)) return 130;
  if (/rx\s*550|rx550/.test(n)) return 50;
  return 180;
}

/** Extract chip like "RTX 4060 Ti" / "RX 9070 XT" from Anhoch or Setec SKUs. */
function extractGpuChip(raw: string): string | null {
  const s = raw.replace(/[-_]/g, " ");
  const nvidia = s.match(
    /\b(?:GeForce\s+)?(RTX|GTX|GT)\s*(\d{3,4})\s*(Ti|SUPER)?\b/i
  );
  if (nvidia) {
    const family = nvidia[1].toUpperCase();
    const num = nvidia[2];
    const suffix = nvidia[3] ? ` ${nvidia[3][0].toUpperCase()}${nvidia[3].slice(1).toLowerCase()}` : "";
    return `${family} ${num}${suffix}`;
  }
  const amd = s.match(/\b(?:Radeon\s+)?(RX)\s*(\d{3,4})\s*(XT|GRE|XTX)?\b/i);
  if (amd) {
    const num = amd[2];
    const suffix = amd[3] ? ` ${amd[3].toUpperCase()}` : "";
    return `RX ${num}${suffix}`;
  }
  return null;
}

function extractGpuVram(raw: string): string | undefined {
  const spaced = raw.match(/\b(\d+)\s*GB\b/i)?.[1];
  if (spaced) return `${spaced}GB`;
  // Setec SKUs: -O8G, -O16G, -8G, _12G
  const sku = raw.match(/(?:^|[-_\s])O?(\d{1,2})G(?:DDR\d)?(?:$|[-_\s])/i)?.[1];
  if (sku) return `${sku}GB`;
  // Compact GDDR tags: 2GD5, 4GD3, 2GDDR5
  const gd = raw.match(/\b(\d{1,2})G(?:DDR|D)[DR]?\d?\b/i)?.[1];
  if (gd) return `${gd}GB`;
  return undefined;
}

function gpuDedupeKey(chip: string, vram?: string): string {
  return `${chip.toLowerCase()}|${(vram ?? "").toLowerCase()}`;
}

function parseGpuName(raw: string): { brand: string; name: string; chip: string; vram?: string } | null {
  if (/WireView|Thermal Grizzly|Measuring|Riser\s*Cable|Splitter\s*Cable|сунѓер|Кабел|Kabllo/i.test(raw)) {
    return null;
  }
  if (!/\b(GeForce|Radeon|RTX|GTX|GT\s*\d|RX\s*\d)/i.test(raw) && !/\b(RTX|GTX|GT|RX)\d{3,4}/i.test(raw)) {
    return null;
  }

  let cleaned = raw
    .replace(/^(GPU|Графичка\s*картичка|Kartel[eë]\s*grafike|Karte\s*grafike|Kartele\s*grafike)\s+/i, "")
    .trim();

  const brand = normalizeBrand(extractBrand(cleaned));
  let s = cleaned.replace(new RegExp(`^${brand}\\s+`, "i"), "");
  s = s.replace(/^AMD\s+/i, "").replace(/^NVIDIA\s+/i, "");

  const chip = extractGpuChip(raw);
  if (!chip) return null;

  const vram = extractGpuVram(raw);
  const series = s.match(
    /\b(WINDFORCE(?:\s*(?:2X|3X|MAX))?|EAGLE(?:\s*OC)?(?:\s*ICE)?|AERO(?:\s*OC)?|GAMING(?:\s*OC)?(?:\s*ICE)?|PURE|Dual-X|DUAL|TUF|PRIME|ROG|STRIX|PROART|VENTUS|Twin\s*X2|Challenger|Phantom\s*Gaming|iChill|Frostbite|ArcticStorm|OC)\b/i
  )?.[1];

  let name = [chip, vram, series].filter(Boolean).join(" ");
  if (!name) {
    name = cleanSpaces(
      s
        .replace(/\b\d+x(?:HDMI|DP)\b/gi, "")
        .replace(/\b(?:HDMI|DP|DX12U|PCIe\s*[\d.]+|GDDR\d)\b/gi, "")
        .replace(/\//g, " ")
    )
      .split(" ")
      .slice(0, 8)
      .join(" ");
  }
  name = cleanSpaces(name.replace(/\s+/g, " "));
  return { brand, name, chip, vram };
}

function preferCheapestInStock(prev: AnhochPart, next: AnhochPart): AnhochPart {
  const prevIn = prev.stock > 0;
  const nextIn = next.stock > 0;
  if (nextIn && !prevIn) return next;
  if (prevIn && !nextIn) return prev;
  return next.priceMkd < prev.priceMkd ? next : prev;
}

/** Keep one listing per chip(+VRAM); prefer in-stock, then cheaper. */
export function dedupeGpusByCheapest(parts: AnhochPart[]): AnhochPart[] {
  const best = new Map<string, AnhochPart>();
  for (const part of parts) {
    const chip = extractGpuChip(part.name) ?? part.name;
    const vram = extractGpuVram(part.name);
    const key = gpuDedupeKey(chip, vram);
    const prev = best.get(key);
    if (!prev) best.set(key, part);
    else best.set(key, preferCheapestInStock(prev, part));
  }
  return [...best.values()].sort((a, b) => a.priceMkd - b.priceMkd);
}

/** GPUs from Anhoch / Setec CSV (name, price_mkd, image_url). */
export function loadAnhochGpus(csvPath: string): AnhochPart[] {
  const parts: AnhochPart[] = [];
  for (const r of readCsvRows(csvPath, 5)) {
    const parsed = parseGpuName(r.name);
    if (!parsed) continue;
    parts.push({
      name: parsed.name,
      brand: parsed.brand,
      category: PartCategory.GPU,
      priceMkd: r.priceMkd,
      stock: r.stock,
      tdpWatts: estimateGpuTdp(`${parsed.name} ${r.name}`),
      imageUrl: r.imageUrl,
      source: r.source,
    });
  }
  return parts;
}

export function loadSetecGpus(csvPath: string): AnhochPart[] {
  return loadAnhochGpus(csvPath);
}

/** RAM */
function isRamProductName(raw: string): boolean {
  const n = raw.toLowerCase();
  if (
    /sodimm|so[\s\-]?dimm|laptop|notebook|за\s*лаптоп|per\s*laptop|za\s*laptop|microsd|sd\s*card|usb\s*flash|ssd\b|hdd\b|картичк|memory\s*card/i.test(
      n,
    )
  ) {
    return false;
  }
  return /\b(ddr[345]|dimm)\b/i.test(raw);
}

function ramDedupeKey(part: AnhochPart): string {
  const n = part.name.toLowerCase();
  const cap = n.match(/(\d+)\s*gb/)?.[1] ?? "";
  const type = part.ramType?.toLowerCase() ?? (/\bddr5\b/.test(n) ? "ddr5" : "ddr4");
  const speed = n.match(/(\d{4})\s*(?:mhz|mt)/)?.[1] ?? "";
  const layout = parseRamKitLayout(part.name);
  const kit = layout ? `${layout.modules}x${layout.perModuleGb}` : "";
  const brand = part.brand.toLowerCase();
  return `${brand}|${cap}|${type}|${speed}|${kit}`;
}

export function dedupeRamsByCheapest(parts: AnhochPart[]): AnhochPart[] {
  const best = new Map<string, AnhochPart>();
  for (const part of parts) {
    const key = ramDedupeKey(part);
    const prev = best.get(key);
    if (!prev) best.set(key, part);
    else best.set(key, preferCheapestInStock(prev, part));
  }
  return [...best.values()].sort((a, b) => a.priceMkd - b.priceMkd);
}

export function loadAnhochRams(csvPath: string): AnhochPart[] {
  if (!fs.existsSync(csvPath)) return [];
  return readCsvRows(csvPath, 10)
    .filter((r) => isRamProductName(r.name))
    .map((r) => {
      const ramType = /\bDDR5\b/i.test(r.name) ? "DDR5" : /\bDDR3\b/i.test(r.name) ? "DDR3" : "DDR4";
      const brand = normalizeBrand(
        extractBrand(r.name.replace(/^(DIMM|RAM(?:\s*DIMM)?|Оперативна\s*меморија|Memorie(?:\s*RAM)?|Меморија(?:\s*RAM)?)\s+/i, ""))
      );
      let name = r.name
        .replace(/^(DIMM|RAM(?:\s*DIMM)?|Оперативна\s*меморија|Memorie(?:\s*RAM)?|Меморија(?:\s*RAM)?)\s+/i, "")
        .replace(/\bMhz\b/gi, "MHz")
        .replace(/,/g, " ");
      const layout = parseRamKitLayout(name);
      const cap =
        name.match(/\b(\d+\s*GB)\b/i)?.[1]?.replace(/\s+/g, "") ??
        (layout ? `${layout.modules * layout.perModuleGb}GB` : undefined);
      const speed = name.match(/\b(\d{4})\s*(?:MHz|MT\/?s)\b/i)?.[1];
      const kit = layout ? `${layout.modules}x${layout.perModuleGb}GB` : null;
      const product = name
        .replace(/\(\s*[1248]\s*[x×]\s*\d+\s*(?:GB)?(?:\s*Kit)?\s*\)/gi, "")
        .replace(/\(\s*kit\s*of\s*[24]\s*\)/gi, "")
        .replace(/\b[1248]\s*[x×]\s*\d+\s*GB\b/gi, "")
        .replace(/\bkit\s*of\s*[24]\b/gi, "")
        .replace(/\b(?:комплет|сет|кит)\s*[24]\s*x\b/gi, "")
        .replace(/\b\d{1,2}GX[24]\b/gi, "")
        .replace(/\b\d+\s*GB\b/gi, "")
        .replace(/\bDDR[345]\b/gi, "")
        .replace(/\b\d{4}\s*(?:MHz|MT\/?s)\b/gi, "")
        .replace(/\bCL\d+\b/gi, "")
        .replace(/\b(XMP|EXPO|RGB|ECC|Unbuffered|Server Memory|1Rx\d+|2Rx\d+|комплет|kit|Non-?ECC)\b/gi, "")
        .replace(/\(\s*(?:[1248]\s*[x×])?\s*\)/g, "")
        .replace(new RegExp(`\\b${brand}\\b`, "ig"), "")
        .replace(/\bKingston\b/gi, "");
      name = cleanSpaces(
        [cap, ramType, speed ?? null, cleanSpaces(product).split(" ").slice(0, 4).join(" "), kit ? `(${kit})` : null]
          .filter(Boolean)
          .join(" "),
      )
        .replace(/\(\s*(?:[1248]\s*[x×])?\s*\)/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return {
        name,
        brand,
        category: PartCategory.RAM,
        priceMkd: r.priceMkd,
        stock: r.stock,
        ramType,
        imageUrl: r.imageUrl,
        source: r.source,
      };
    })
    .filter((p) => p.name && p.ramType);
}

/** PSUs */
export function loadAnhochPsus(csvPath: string): AnhochPart[] {
  return readCsvRows(csvPath, 8)
    .filter((r) => /^PSU\b/i.test(r.name))
    .map((r) => {
      const wattage = Number(r.name.match(/\b(\d{3,4})\s*W\b/i)?.[1] ?? 0);
      const rest = r.name.replace(/^PSU\s+/i, "").replace(/^\d{3,4}\s*W\s+/i, "");
      const brand = normalizeBrand(extractBrand(rest));
      let name = cleanSpaces(
        rest
          .replace(new RegExp(`^${brand}\\s+`, "i"), "")
          .replace(/\b80\s*Plus\b/gi, "80+")
          .replace(/\bCybenetics[^.]*\.?/gi, "")
          .replace(/\bFull Modular\b/gi, "Modular")
          .replace(/\bPCIe Gen [\d.]+/gi, "")
          .replace(/\b12V-2x6\b/gi, "")
          .replace(/\b12VHPWR\b/gi, "")
          .replace(/,/g, " ")
          .replace(/\//g, " ")
      );
      name = `${wattage}W ${name}`.replace(/\s+/g, " ").trim();
      name = name.split(" ").slice(0, 8).join(" ");
      return {
        name,
        brand,
        category: PartCategory.PSU,
        priceMkd: r.priceMkd,
        stock: r.stock,
        wattage: wattage || undefined,
        imageUrl: r.imageUrl,
        source: r.source,
      };
    })
    .filter((p) => p.wattage && p.wattage >= 300);
}

/** Cases */
export function loadAnhochCases(csvPath: string): AnhochPart[] {
  return readCsvRows(csvPath, 6).map((r) => {
    const raw = r.name;
    const isItx = /\bMini[\s-]?ITX\b|\bITX\b/i.test(raw) && !/\bATX\b/i.test(raw);
    const isMatx =
      /\bMicro\b/i.test(raw) ||
      /\bmATX\b/i.test(raw) ||
      /\bMicro[\s-]?ATX\b/i.test(raw);
    const formFactor = isItx ? "ITX" : isMatx ? "mATX" : "ATX";

    let body = raw
      .replace(/^ATX\s+(?:Micro|Midi|Full)?\s*(?:Tower\s+)?Case\s+/i, "")
      .replace(/^Micro[\s-]?ATX\s+(?:Tower\s+)?Case\s+/i, "")
      .replace(/^Mini[\s-]?ITX\s+(?:Tower\s+)?Case\s+/i, "")
      .replace(/^Case\s+/i, "");
    const brand = normalizeBrand(extractBrand(body));
    let name = cleanSpaces(
      body
        .replace(new RegExp(`^${brand}\\s+`, "i"), "")
        .replace(/\bw\/USB[\s\S]*$/i, "")
        .replace(/\bw\/[\s\S]*$/i, "")
        .replace(/,/g, " ")
    );
    name = name.split(" ").slice(0, 7).join(" ");

    return {
      name,
      brand,
      category: PartCategory.CASE,
      priceMkd: r.priceMkd,
      stock: r.stock,
      formFactor,
      imageUrl: r.imageUrl,
      source: r.source,
    };
  });
}

/** SSDs */
export function loadAnhochSsds(csvPath: string): AnhochPart[] {
  return readCsvRows(csvPath, 10)
    .filter((r) => /^SSD\b/i.test(r.name))
    .map((r) => {
      const rest = r.name.replace(/^SSD\s+/i, "").replace(/^M\.2\s+/i, "M.2 ").replace(/^2\.5"?\s+/i, '2.5" ');
      const brand = normalizeBrand(extractBrand(rest));
      let name = cleanSpaces(
        rest
          .replace(new RegExp(`\\b${brand}\\b`, "i"), "")
          .replace(/\bPCIe\s*[\d.\sx]+/gi, "")
          .replace(/\bSATA3?\b/gi, "SATA")
          .replace(/\b7mm\b/gi, "")
          .replace(/\b2280\b/gi, "")
          .replace(/\//g, " ")
          .replace(/,/g, " ")
      );
      name = name.split(" ").filter(Boolean).slice(0, 8).join(" ");
      return {
        name,
        brand,
        category: PartCategory.SSD,
        priceMkd: r.priceMkd,
        stock: r.stock,
        imageUrl: r.imageUrl,
        source: r.source,
      };
    });
}

/** HDDs — shown in the SSD/storage step */
export function loadAnhochHdds(csvPath: string): AnhochPart[] {
  return readCsvRows(csvPath, 6)
    .filter((r) => /^HDD\b/i.test(r.name))
    .map((r) => {
      const rest = r.name.replace(/^HDD\s+/i, "").replace(/^3\.5"?\s+/i, "");
      const brand = normalizeBrand(extractBrand(rest));
      let name = cleanSpaces(
        rest
          .replace(new RegExp(`\\b${brand}\\b`, "i"), "")
          .replace(/\bWestern Digital\b/gi, "")
          .replace(/\bSATA3?\b/gi, "SATA")
          .replace(/\b\d+MB\b/gi, "")
          .replace(/\b\d+rpm\b/gi, "")
          .replace(/,/g, " ")
      );
      name = `HDD ${name}`.split(" ").filter(Boolean).slice(0, 8).join(" ");
      return {
        name,
        brand,
        category: PartCategory.SSD,
        priceMkd: r.priceMkd,
        stock: r.stock,
        imageUrl: r.imageUrl,
        source: r.source,
      };
    });
}

function estimateCoolerTdp(raw: string): number {
  const rated = raw.match(/\bup to\s*(\d+)\s*W\b/i);
  if (rated) return Number(rated[1]);
  const n = raw.toLowerCase();
  if (/liquid/.test(n)) {
    if (/\b360\b/.test(n)) return 300;
    if (/\b280\b/.test(n)) return 290;
    if (/\b240\b/.test(n)) return 280;
    if (/\b120\b/.test(n)) return 200;
    return 280;
  }
  if (/assassin\s*4|ak620|peerless|nh-d15/.test(n)) return 260;
  if (/ak500|ag620|assassin/.test(n)) return 240;
  if (/ak400|ag400|pa120/.test(n)) return 220;
  if (/ag300|hyper\s*212/.test(n)) return 150;
  if (/ag200|iceedge|ice\s*edge/.test(n)) return 100;
  // Tiny stock-style / fan heatsinks — not enough for modern desktop CPUs
  if (/gamma|archer|ck-?\s*115|ck-11509|ck11509/.test(n)) return 65;
  return 180;
}

/**
 * Parse which CPU sockets a cooler supports.
 * Stored as comma-separated values on Part.socket (e.g. "AM4,AM5").
 * CK-11509 is Intel LGA only — must not match Ryzen AM5.
 */
export function parseCoolerSockets(raw: string): string | undefined {
  const n = raw.toLowerCase();
  const socks = new Set<string>();

  if (/\bam5\b/.test(n)) socks.add("AM5");
  if (/\bam4\b/.test(n)) socks.add("AM4");
  if (/\b(?:lga\s*)?1851\b/.test(n)) socks.add("LGA1851");
  if (/\b(?:lga\s*)?1700\b/.test(n)) socks.add("LGA1700");
  if (/\b(?:lga\s*)?1200\b/.test(n)) socks.add("LGA1200");
  if (/\b(?:lga\s*)?115[0156]\b/.test(n)) socks.add("LGA1151");

  const universal =
    /all\s*intel\s*\/\s*amd|intel\s*\/\s*amd|sockets?\s*intel\s*\/\s*amd/i.test(raw);
  if (universal) {
    socks.add("AM4");
    socks.add("AM5");
    socks.add("LGA1700");
    socks.add("LGA1851");
    socks.add("LGA1200");
  }

  if (socks.size) return [...socks].join(",");

  // Explicit Intel-only listing with no AMD → do not allow AMD CPUs
  if (/\bintel\b/.test(n) && !/\bamd\b/.test(n)) {
    return "LGA1700,LGA1851,LGA1200,LGA1151";
  }
  // AMD-only
  if (/\bamd\b/.test(n) && !/\bintel\b/.test(n)) {
    return "AM4,AM5";
  }
  return undefined;
}

/** Cooler Part.socket (comma list) fits a CPU socket. */
export function coolerSupportsSocket(
  coolerSocket: string | null | undefined,
  cpuSocket: string | null | undefined,
): boolean {
  if (!coolerSocket?.trim() || !cpuSocket?.trim()) return true;
  const supported = coolerSocket
    .split(/[,;/|]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (!supported.length) return true;
  return supported.includes(cpuSocket.trim().toUpperCase());
}

/** CPU coolers only (skip paste, pads, standalone case fans) */
export function loadAnhochCoolers(csvPath: string): AnhochPart[] {
  return readCsvRows(csvPath, 8)
    .filter((r) => /^Cooler\b/i.test(r.name))
    .map((r) => {
      const isLiquid = /\bLiquid\b/i.test(r.name);
      const rest = r.name.replace(/^Cooler\s+(?:Liquid\s+)?/i, "");
      const brand = normalizeBrand(extractBrand(rest));
      const sockets = parseCoolerSockets(r.name);
      let name = cleanSpaces(
        rest
          .replace(new RegExp(`^${brand}\\s+`, "i"), "")
          .replace(/\bAll Intel\/AMD\b/gi, "")
          .replace(/\ball Intel\/AMD\b/gi, "")
          .replace(/\bup to\s*\d+\s*W\b/gi, "")
          .replace(/\bIntel LGA[\s\d/]+/gi, "")
          .replace(/\bAMD AM[45]\b/gi, "")
          .replace(/,/g, " ")
      );
      if (isLiquid && !/^Liquid\b/i.test(name)) name = `Liquid ${name}`;
      name = name.split(" ").filter(Boolean).slice(0, 7).join(" ");
      return {
        name,
        brand,
        category: PartCategory.COOLER,
        priceMkd: r.priceMkd,
        stock: r.stock,
        socket: sockets,
        tdpWatts: estimateCoolerTdp(r.name),
        imageUrl: r.imageUrl,
        source: r.source,
      };
    });
}

export type AnhochInventory = {
  cpus: AnhochCpuPart[];
  motherboards: AnhochPart[];
  gpus: AnhochPart[];
  rams: AnhochPart[];
  psus: AnhochPart[];
  cases: AnhochPart[];
  ssds: AnhochPart[];
  hdds: AnhochPart[];
  coolers: AnhochPart[];
};

export function loadAllAnhochParts(paths: {
  cpus: string;
  /** Extra CPU CSVs (Setec / Gjirafa / Neptun). Duplicates keep the cheaper price. */
  extraCpus?: string[];
  motherboards: string;
  gpus: string;
  /** Extra GPU CSVs — merged; duplicates keep the cheaper price. */
  extraGpus?: string[];
  /** @deprecated use extraGpus */
  setecGpus?: string;
  rams: string;
  extraRams?: string[];
  psus: string;
  cases: string;
  ssds: string;
  hdds: string;
  coolers: string;
}): AnhochPart[] {
  const cpuSources = [paths.cpus, ...(paths.extraCpus ?? [])];
  const cpus = dedupeCpusByCheapest(cpuSources.flatMap((p) => loadAnhochCpus(p)));

  const gpuSources = [
    paths.gpus,
    ...(paths.extraGpus ?? []),
    ...(paths.setecGpus ? [paths.setecGpus] : []),
  ];
  const gpus = dedupeGpusByCheapest(gpuSources.flatMap((p) => loadAnhochGpus(p)));

  const ramSources = [paths.rams, ...(paths.extraRams ?? [])];
  const rams = dedupeRamsByCheapest(ramSources.flatMap((p) => loadAnhochRams(p)));

  const inv: AnhochInventory = {
    cpus,
    motherboards: loadAnhochMotherboards(paths.motherboards),
    gpus,
    rams,
    psus: loadAnhochPsus(paths.psus),
    cases: loadAnhochCases(paths.cases),
    ssds: loadAnhochSsds(paths.ssds),
    hdds: loadAnhochHdds(paths.hdds),
    coolers: loadAnhochCoolers(paths.coolers),
  };

  return [
    ...inv.cpus,
    STOCK_COOLER_PART,
    ...inv.coolers,
    ...inv.motherboards,
    ...inv.rams,
    ...inv.gpus,
    ...inv.psus,
    ...inv.cases,
    ...inv.ssds,
    ...inv.hdds,
  ];
}
