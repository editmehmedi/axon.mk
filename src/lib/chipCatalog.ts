/** Relative 1080p raster/gaming throughput.  RTX 4060 = 100, Ryzen 5 5600 = 100. */

export type ChipConfidence = "exact" | "family" | "fallback";

export type IdentifiedChip = {
  id: string;
  label: string;
  /** Unified 1080p throughput (CPU and GPU share this scale). */
  rel: number;
  confidence: ChipConfidence;
};

type ChipDef = {
  id: string;
  label: string;
  rel: number;
  aliases: string[];
};

const CYRILLIC_LATIN: Record<string, string> = {
  А: "A",
  В: "B",
  Е: "E",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  С: "C",
  Т: "T",
  Х: "X",
  а: "a",
  е: "e",
  к: "k",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  х: "x",
};

export function compactChip(name: string): string {
  const latin = name.replace(/[АВЕКМНОРСТХаекорстх]/g, (ch) => CYRILLIC_LATIN[ch] ?? ch);
  return latin.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function compile(defs: ChipDef[]): { needles: [string, ChipDef][] } {
  const needles: [string, ChipDef][] = [];
  for (const def of defs) {
    for (const alias of def.aliases) {
      const n = compactChip(alias);
      if (n) needles.push([n, def]);
    }
  }
  needles.sort((a, b) => b[0].length - a[0].length);
  return { needles };
}

/** Suffixes that mean a longer/more specific SKU (5060 vs 5060 Ti, 7600 vs 7600X). */
const MORE_SPECIFIC = /^(ti|xtx|xt|super|gre|x3d|3d|kf|ks|x|f|k|g|s)/;

function needleIsComplete(compact: string, needle: string): boolean {
  let from = 0;
  while (from < compact.length) {
    const i = compact.indexOf(needle, from);
    if (i < 0) return false;
    const after = compact.slice(i + needle.length);
    if (!MORE_SPECIFIC.test(after)) return true;
    from = i + 1;
  }
  return false;
}

function longestMatch(compact: string, compiled: { needles: [string, ChipDef][] }): ChipDef | null {
  for (const [needle, def] of compiled.needles) {
    if (needleIsComplete(compact, needle)) return def;
  }
  return null;
}

const GPU_DEFS: ChipDef[] = [
  { id: "rtx-5090", label: "GeForce RTX 5090", rel: 400, aliases: ["rtx 5090", "5090"] },
  { id: "rtx-5080", label: "GeForce RTX 5080", rel: 270, aliases: ["rtx 5080", "5080"] },
  { id: "rtx-4090", label: "GeForce RTX 4090", rel: 310, aliases: ["rtx 4090", "4090"] },
  { id: "rtx-4080-s", label: "GeForce RTX 4080 SUPER", rel: 255, aliases: ["4080 super", "4080s"] },
  { id: "rtx-4080", label: "GeForce RTX 4080", rel: 245, aliases: ["rtx 4080", "4080"] },
  { id: "rtx-5070-ti", label: "GeForce RTX 5070 Ti", rel: 215, aliases: ["5070 ti", "5070ti"] },
  { id: "rtx-4070-ti-s", label: "GeForce RTX 4070 Ti SUPER", rel: 210, aliases: ["4070 ti super", "4070tisuper"] },
  { id: "rtx-4070-ti", label: "GeForce RTX 4070 Ti", rel: 195, aliases: ["4070 ti", "4070ti"] },
  { id: "rtx-4070-s", label: "GeForce RTX 4070 SUPER", rel: 178, aliases: ["4070 super", "4070s"] },
  { id: "rtx-5070", label: "GeForce RTX 5070", rel: 175, aliases: ["rtx 5070", "5070"] },
  { id: "rtx-4070", label: "GeForce RTX 4070", rel: 158, aliases: ["rtx 4070", "4070"] },
  { id: "rtx-5060-ti", label: "GeForce RTX 5060 Ti", rel: 135, aliases: ["5060 ti", "5060ti", "n506t"] },
  { id: "rtx-4060-ti", label: "GeForce RTX 4060 Ti", rel: 122, aliases: ["4060 ti", "4060ti"] },
  { id: "rtx-5060", label: "GeForce RTX 5060", rel: 115, aliases: ["rtx 5060", "5060"] },
  { id: "rtx-4060", label: "GeForce RTX 4060", rel: 100, aliases: ["rtx 4060", "4060"] },
  { id: "rtx-5050", label: "GeForce RTX 5050", rel: 72, aliases: ["rtx 5050", "5050"] },
  { id: "rtx-3090-ti", label: "GeForce RTX 3090 Ti", rel: 195, aliases: ["3090 ti", "3090ti"] },
  { id: "rtx-3090", label: "GeForce RTX 3090", rel: 180, aliases: ["rtx 3090", "3090"] },
  { id: "rtx-3080-ti", label: "GeForce RTX 3080 Ti", rel: 175, aliases: ["3080 ti", "3080ti"] },
  { id: "rtx-3080", label: "GeForce RTX 3080", rel: 160, aliases: ["rtx 3080", "3080"] },
  { id: "rtx-3070-ti", label: "GeForce RTX 3070 Ti", rel: 138, aliases: ["3070 ti", "3070ti"] },
  { id: "rtx-3070", label: "GeForce RTX 3070", rel: 125, aliases: ["rtx 3070", "3070"] },
  { id: "rtx-3060-ti", label: "GeForce RTX 3060 Ti", rel: 105, aliases: ["3060 ti", "3060ti"] },
  { id: "rtx-3060", label: "GeForce RTX 3060", rel: 78, aliases: ["rtx 3060", "3060"] },
  { id: "rtx-3050", label: "GeForce RTX 3050", rel: 55, aliases: ["rtx 3050", "3050"] },
  { id: "gtx-1660-s", label: "GeForce GTX 1660 SUPER", rel: 55, aliases: ["1660 super", "1660s"] },
  { id: "gtx-1660-ti", label: "GeForce GTX 1660 Ti", rel: 56, aliases: ["1660 ti", "1660ti"] },
  { id: "gtx-1660", label: "GeForce GTX 1660", rel: 50, aliases: ["gtx 1660", "1660"] },
  { id: "gtx-1650", label: "GeForce GTX 1650", rel: 40, aliases: ["gtx 1650", "1650"] },
  { id: "gtx-1630", label: "GeForce GTX 1630", rel: 24, aliases: ["gtx 1630", "1630"] },
  { id: "gtx-1050-ti", label: "GeForce GTX 1050 Ti", rel: 28, aliases: ["1050 ti", "1050ti"] },
  { id: "gtx-1050", label: "GeForce GTX 1050", rel: 22, aliases: ["gtx 1050", "1050"] },
  { id: "gt-1030", label: "GeForce GT 1030", rel: 14, aliases: ["gt 1030", "1030"] },
  { id: "gt-730", label: "GeForce GT 730", rel: 10, aliases: ["gt 730", "gt730"] },
  { id: "gt-710", label: "GeForce GT 710", rel: 8, aliases: ["gt 710", "gt710"] },
  { id: "gt-610", label: "GeForce GT 610", rel: 6, aliases: ["gt 610", "gt610"] },
  { id: "gt-240", label: "GeForce GT 240", rel: 5, aliases: ["gt 240", "gt240"] },
  { id: "gt-210", label: "GeForce 210", rel: 4, aliases: ["gt 210", "gt210", "geforce 210"] },
  { id: "rx-9070-xt", label: "Radeon RX 9070 XT", rel: 220, aliases: ["9070 xt", "9070xt", "r907x"] },
  { id: "rx-9070-gre", label: "Radeon RX 9070 GRE", rel: 200, aliases: ["9070 gre", "9070gre", "r907gre"] },
  { id: "rx-9070", label: "Radeon RX 9070", rel: 190, aliases: ["rx 9070", "9070"] },
  { id: "rx-9060-xt-16", label: "Radeon RX 9060 XT 16GB", rel: 132, aliases: ["9060 xt 16", "9060xt16", "rx9060xt16"] },
  { id: "rx-9060-xt", label: "Radeon RX 9060 XT", rel: 124, aliases: ["9060 xt", "9060xt", "rx9060xt"] },
  { id: "rx-9060", label: "Radeon RX 9060", rel: 110, aliases: ["rx 9060", "9060"] },
  { id: "rx-7900-xtx", label: "Radeon RX 7900 XTX", rel: 245, aliases: ["7900 xtx", "7900xtx"] },
  { id: "rx-7900-xt", label: "Radeon RX 7900 XT", rel: 210, aliases: ["7900 xt", "7900xt"] },
  { id: "rx-7900-gre", label: "Radeon RX 7900 GRE", rel: 185, aliases: ["7900 gre", "7900gre"] },
  { id: "rx-7800-xt", label: "Radeon RX 7800 XT", rel: 175, aliases: ["7800 xt", "7800xt"] },
  { id: "rx-7700-xt", label: "Radeon RX 7700 XT", rel: 140, aliases: ["7700 xt", "7700xt"] },
  { id: "rx-7600-xt", label: "Radeon RX 7600 XT", rel: 108, aliases: ["7600 xt", "7600xt"] },
  { id: "rx-7600", label: "Radeon RX 7600", rel: 95, aliases: ["rx 7600", "7600"] },
  { id: "rx-6950-xt", label: "Radeon RX 6950 XT", rel: 172, aliases: ["6950 xt", "6950xt"] },
  { id: "rx-6900-xt", label: "Radeon RX 6900 XT", rel: 165, aliases: ["6900 xt", "6900xt"] },
  { id: "rx-6800-xt", label: "Radeon RX 6800 XT", rel: 155, aliases: ["6800 xt", "6800xt"] },
  { id: "rx-6800", label: "Radeon RX 6800", rel: 140, aliases: ["rx 6800", "6800"] },
  { id: "rx-6750-xt", label: "Radeon RX 6750 XT", rel: 122, aliases: ["6750 xt", "6750xt"] },
  { id: "rx-6700-xt", label: "Radeon RX 6700 XT", rel: 118, aliases: ["6700 xt", "6700xt"] },
  { id: "rx-6650-xt", label: "Radeon RX 6650 XT", rel: 95, aliases: ["6650 xt", "6650xt"] },
  { id: "rx-6600-xt", label: "Radeon RX 6600 XT", rel: 92, aliases: ["6600 xt", "6600xt"] },
  { id: "rx-6600", label: "Radeon RX 6600", rel: 80, aliases: ["rx 6600", "6600"] },
  { id: "rx-6500-xt", label: "Radeon RX 6500 XT", rel: 38, aliases: ["6500 xt", "6500xt"] },
  { id: "rx-6400", label: "Radeon RX 6400", rel: 28, aliases: ["rx 6400", "6400"] },
  { id: "rx-5700-xt", label: "Radeon RX 5700 XT", rel: 68, aliases: ["5700 xt", "5700xt"] },
  { id: "rx-5600-xt", label: "Radeon RX 5600 XT", rel: 58, aliases: ["5600 xt", "5600xt"] },
  { id: "rx-5500-xt", label: "Radeon RX 5500 XT", rel: 42, aliases: ["5500 xt", "5500xt"] },
  { id: "rx-580", label: "Radeon RX 580", rel: 48, aliases: ["rx 580", "rx580"] },
  { id: "rx-550", label: "Radeon RX 550", rel: 18, aliases: ["rx 550", "rx550"] },
  { id: "arc-b580", label: "Intel Arc B580", rel: 115, aliases: ["arc b580", "b580"] },
  { id: "arc-a770", label: "Intel Arc A770", rel: 98, aliases: ["arc a770", "a770"] },
  { id: "arc-a750", label: "Intel Arc A750", rel: 88, aliases: ["arc a750", "a750"] },
];

const CPU_DEFS: ChipDef[] = [
  { id: "r9-9950x3d", label: "Ryzen 9 9950X3D", rel: 188, aliases: ["9950x3d"] },
  { id: "r9-9950x", label: "Ryzen 9 9950X", rel: 162, aliases: ["9950x"] },
  { id: "r9-9900x", label: "Ryzen 9 9900X", rel: 160, aliases: ["9900x"] },
  { id: "r7-9850x3d", label: "Ryzen 7 9850X3D", rel: 200, aliases: ["9850x3d"] },
  { id: "r7-9800x3d", label: "Ryzen 7 9800X3D", rel: 195, aliases: ["9800x3d"] },
  { id: "r7-9700x", label: "Ryzen 7 9700X", rel: 155, aliases: ["9700x"] },
  { id: "r5-9600x", label: "Ryzen 5 9600X", rel: 148, aliases: ["9600x"] },
  { id: "r9-7950x3d", label: "Ryzen 9 7950X3D", rel: 168, aliases: ["7950x3d"] },
  { id: "r9-7950x", label: "Ryzen 9 7950X", rel: 152, aliases: ["7950x"] },
  { id: "r9-7900x", label: "Ryzen 9 7900X", rel: 150, aliases: ["7900x"] },
  { id: "r7-7800x3d", label: "Ryzen 7 7800X3D", rel: 175, aliases: ["7800x3d"] },
  { id: "r7-7700x", label: "Ryzen 7 7700X", rel: 144, aliases: ["7700x"] },
  { id: "r7-7700", label: "Ryzen 7 7700", rel: 140, aliases: ["ryzen 7 7700", "r7 7700"] },
  { id: "r5-7600x", label: "Ryzen 5 7600X", rel: 136, aliases: ["7600x"] },
  { id: "r5-7600", label: "Ryzen 5 7600", rel: 132, aliases: ["ryzen 5 7600"] },
  { id: "r5-7500x3d", label: "Ryzen 5 7500X3D", rel: 158, aliases: ["7500x3d"] },
  { id: "r5-7500f", label: "Ryzen 5 7500F", rel: 128, aliases: ["7500f"] },
  { id: "r7-8700f", label: "Ryzen 7 8700F", rel: 138, aliases: ["8700f"] },
  { id: "r7-8700g", label: "Ryzen 7 8700G", rel: 128, aliases: ["8700g"] },
  { id: "r5-8600g", label: "Ryzen 5 8600G", rel: 122, aliases: ["8600g"] },
  { id: "r5-8500g", label: "Ryzen 5 8500G", rel: 118, aliases: ["8500g"] },
  { id: "r5-8400f", label: "Ryzen 5 8400F", rel: 125, aliases: ["8400f"] },
  { id: "r7-5800x3d", label: "Ryzen 7 5800X3D", rel: 140, aliases: ["5800x3d"] },
  { id: "r7-5700x3d", label: "Ryzen 7 5700X3D", rel: 138, aliases: ["5700x3d"] },
  { id: "r7-5800x", label: "Ryzen 7 5800X", rel: 114, aliases: ["5800x"] },
  { id: "r7-5700x", label: "Ryzen 7 5700X", rel: 110, aliases: ["5700x"] },
  { id: "r5-5600x", label: "Ryzen 5 5600X", rel: 105, aliases: ["5600x"] },
  { id: "r5-5600g", label: "Ryzen 5 5600G", rel: 92, aliases: ["5600g"] },
  { id: "r5-5600", label: "Ryzen 5 5600", rel: 100, aliases: ["ryzen 5 5600"] },
  { id: "r5-5500", label: "Ryzen 5 5500", rel: 88, aliases: ["ryzen 5 5500"] },
  { id: "r5-3600x", label: "Ryzen 5 3600X", rel: 86, aliases: ["3600x"] },
  { id: "r5-3600", label: "Ryzen 5 3600", rel: 82, aliases: ["ryzen 5 3600"] },
  { id: "r3-3200g", label: "Ryzen 3 3200G", rel: 45, aliases: ["3200g"] },
  { id: "r3-3400g", label: "Ryzen 3 3400G", rel: 48, aliases: ["3400g"] },
  { id: "athlon-3000g", label: "Athlon 3000G", rel: 42, aliases: ["3000g", "athlon 3000"] },
  { id: "i9-14900ks", label: "Core i9-14900KS", rel: 162, aliases: ["14900ks"] },
  { id: "i9-14900k", label: "Core i9-14900K", rel: 158, aliases: ["14900k", "14900kf"] },
  { id: "i7-14700k", label: "Core i7-14700K", rel: 152, aliases: ["14700k", "14700kf"] },
  { id: "i7-14700", label: "Core i7-14700", rel: 148, aliases: ["i7-14700", "i714700"] },
  { id: "i5-14600k", label: "Core i5-14600K", rel: 145, aliases: ["14600k", "14600kf"] },
  { id: "i5-14500", label: "Core i5-14500", rel: 130, aliases: ["14500"] },
  { id: "i5-14400f", label: "Core i5-14400F", rel: 122, aliases: ["14400f"] },
  { id: "i5-14400", label: "Core i5-14400", rel: 122, aliases: ["14400"] },
  { id: "i3-14100f", label: "Core i3-14100F", rel: 100, aliases: ["14100f"] },
  { id: "i3-14100", label: "Core i3-14100", rel: 98, aliases: ["14100"] },
  { id: "i9-13900k", label: "Core i9-13900K", rel: 154, aliases: ["13900k", "13900kf"] },
  { id: "i7-13700k", label: "Core i7-13700K", rel: 148, aliases: ["13700k", "13700kf"] },
  { id: "i7-13700", label: "Core i7-13700", rel: 140, aliases: ["i7-13700"] },
  { id: "i5-13600k", label: "Core i5-13600K", rel: 142, aliases: ["13600k", "13600kf"] },
  { id: "i5-13500", label: "Core i5-13500", rel: 128, aliases: ["13500"] },
  { id: "i5-13400f", label: "Core i5-13400F", rel: 118, aliases: ["13400f"] },
  { id: "i5-13400", label: "Core i5-13400", rel: 118, aliases: ["13400"] },
  { id: "i3-13100", label: "Core i3-13100", rel: 95, aliases: ["13100", "13100f"] },
  { id: "i9-12900k", label: "Core i9-12900K", rel: 132, aliases: ["12900k", "12900kf"] },
  { id: "i7-12700k", label: "Core i7-12700K", rel: 128, aliases: ["12700k", "12700kf"] },
  { id: "i7-12700", label: "Core i7-12700", rel: 120, aliases: ["i7-12700", "i712700"] },
  { id: "i5-12600k", label: "Core i5-12600K", rel: 125, aliases: ["12600k", "12600kf"] },
  { id: "i5-12400f", label: "Core i5-12400F", rel: 110, aliases: ["12400f"] },
  { id: "i5-12400", label: "Core i5-12400", rel: 108, aliases: ["12400"] },
  { id: "i3-12100f", label: "Core i3-12100F", rel: 92, aliases: ["12100f"] },
  { id: "i3-12100", label: "Core i3-12100", rel: 90, aliases: ["12100"] },
  { id: "i5-11400", label: "Core i5-11400", rel: 82, aliases: ["11400", "11400f"] },
  { id: "i5-10400", label: "Core i5-10400", rel: 78, aliases: ["10400", "10400f"] },
  { id: "i3-10100", label: "Core i3-10100", rel: 70, aliases: ["10100", "10100f"] },
  { id: "u9-285k", label: "Core Ultra 9 285K", rel: 158, aliases: ["ultra 9 285", "285k"] },
  { id: "u7-265k", label: "Core Ultra 7 265K", rel: 150, aliases: ["ultra 7 265", "265k", "265kf"] },
  { id: "u5-250kf", label: "Core Ultra 5 250KF", rel: 140, aliases: ["ultra 5 250", "250kf", "250k"] },
  { id: "u5-245k", label: "Core Ultra 5 245K", rel: 138, aliases: ["ultra 5 245", "245k", "245kf"] },
  { id: "u5-235", label: "Core Ultra 5 235", rel: 128, aliases: ["ultra 5 235"] },
  { id: "u5-225f", label: "Core Ultra 5 225F", rel: 122, aliases: ["ultra 5 225", "225f", "225kf"] },
];

const GPU_INDEX = compile(GPU_DEFS);
const CPU_INDEX = compile(CPU_DEFS);

function identified(def: ChipDef, confidence: ChipConfidence): IdentifiedChip {
  return { id: def.id, label: def.label, rel: def.rel, confidence };
}

function estimateNvidia(model: number, suffix: string): number | null {
  const series = Math.floor(model / 100);
  const tier = model % 100;
  const ti = suffix.includes("ti");
  const sup = suffix.includes("super");
  if (series === 50) {
    if (tier >= 90) return 400;
    if (tier >= 80) return 270;
    if (tier >= 70) return ti ? 215 : 175;
    if (tier >= 60) return ti ? 135 : 115;
    return 72;
  }
  if (series === 40) {
    if (tier >= 90) return 310;
    if (tier >= 80) return sup ? 255 : 245;
    if (tier >= 70) return ti && sup ? 210 : ti ? 195 : sup ? 178 : 158;
    if (tier >= 60) return ti ? 122 : 100;
    return 72;
  }
  if (series === 30) {
    if (tier >= 90) return ti ? 195 : 180;
    if (tier >= 80) return ti ? 175 : 160;
    if (tier >= 70) return ti ? 138 : 125;
    if (tier >= 60) return ti ? 105 : 78;
    return 55;
  }
  if (series === 16) return ti || sup ? 56 : 50;
  if (series === 10) return ti ? 28 : model >= 1030 ? 14 : 22;
  if (model === 730 || model === 710 || model === 610) return 8;
  return null;
}

function estimateAmd(model: number, suffix: string): number | null {
  const xtx = suffix.includes("xtx");
  const xt = suffix.includes("xt");
  const gre = suffix.includes("gre");
  if (model >= 9070) return xt ? 220 : gre ? 200 : 190;
  if (model >= 9060) return xt ? 124 : 110;
  if (model >= 7900) return xtx ? 245 : xt ? 210 : gre ? 185 : 200;
  if (model >= 7800) return 175;
  if (model >= 7700) return 140;
  if (model >= 7600) return xt ? 108 : 95;
  if (model >= 6900) return 165;
  if (model >= 6800) return xt ? 155 : 140;
  if (model >= 6700) return 118;
  if (model >= 6600) return xt ? 92 : 80;
  if (model >= 6500) return 38;
  if (model >= 580) return 48;
  if (model >= 550) return 18;
  return null;
}

function estimateRyzen(model: number, suffix: string): number {
  const gen = Math.floor(model / 1000);
  const tier = Math.floor((model % 1000) / 100);
  const x3d = suffix.includes("x3d");
  if (x3d) {
    if (gen >= 9) return tier >= 9 ? 188 : 195;
    if (gen >= 7) return tier >= 8 ? 175 : 158;
    return 140;
  }
  if (gen >= 9) {
    if (tier >= 9) return 162;
    if (tier >= 7) return 155;
    return 148;
  }
  if (gen >= 8) {
    if (tier >= 7) return 138;
    return 122;
  }
  if (gen >= 7) {
    if (tier >= 9) return 152;
    if (tier >= 7) return 144;
    return 132;
  }
  if (gen >= 5) {
    if (tier >= 8) return 114;
    if (tier >= 7) return 110;
    return 100;
  }
  if (gen >= 3) return 82;
  return 50;
}

function estimateIntel(family: string, model: number, suffix: string): number {
  const gen = Math.floor(model / 100);
  const k = suffix.includes("k");
  if (family === "9") {
    if (gen >= 14) return 158;
    if (gen >= 13) return 154;
    if (gen >= 12) return 132;
    return 110;
  }
  if (family === "7") {
    if (gen >= 14) return k ? 152 : 148;
    if (gen >= 13) return k ? 148 : 140;
    if (gen >= 12) return k ? 128 : 120;
    return 100;
  }
  if (family === "5") {
    if (gen >= 14) return k ? 145 : 122;
    if (gen >= 13) return k ? 142 : 118;
    if (gen >= 12) return k ? 125 : 110;
    return 82;
  }
  if (gen >= 14) return 100;
  if (gen >= 12) return 90;
  return 70;
}

function vramBonus(compact: string, def: ChipDef): number {
  if (def.id !== "rx-9060-xt") return def.rel;
  if (/16g/.test(compact)) return 132;
  return def.rel;
}

export function identifyGpu(name: string): IdentifiedChip {
  const compact = compactChip(name);
  const exact = longestMatch(compact, GPU_INDEX);
  if (exact) {
    return {
      id: exact.id,
      label: exact.label,
      rel: vramBonus(compact, exact),
      confidence: "exact",
    };
  }

  const nvidia = compact.match(/(rtx|gtx|gt)(\d{3,4})(tisuper|super|ti)?/);
  if (nvidia) {
    const model = Number.parseInt(nvidia[2], 10);
    const suffix = nvidia[3] ?? "";
    const rel = estimateNvidia(model, suffix);
    if (rel != null) {
      const tag = suffix ? ` ${suffix.toUpperCase()}` : "";
      return {
        id: `${nvidia[1]}-${model}${suffix}`,
        label: `GeForce ${nvidia[1].toUpperCase()} ${model}${tag}`,
        rel,
        confidence: "family",
      };
    }
  }

  const amd = compact.match(/rx(\d{3,4})(xtx|xt|gre)?/);
  if (amd) {
    const model = Number.parseInt(amd[1], 10);
    const suffix = amd[2] ?? "";
    const rel = estimateAmd(model, suffix);
    if (rel != null) {
      return {
        id: `rx-${model}${suffix}`,
        label: `Radeon RX ${model}${suffix ? ` ${suffix.toUpperCase()}` : ""}`,
        rel,
        confidence: "family",
      };
    }
  }

  if (compact.includes("rtx") || compact.includes("gtx")) {
    return { id: "unknown-nvidia", label: "NVIDIA GPU", rel: 90, confidence: "fallback" };
  }
  if (/\brx\d/.test(compact) || compact.includes("radeon")) {
    return { id: "unknown-amd", label: "AMD GPU", rel: 90, confidence: "fallback" };
  }
  return { id: "unknown-gpu", label: "GPU", rel: 70, confidence: "fallback" };
}

export function identifyCpu(name: string): IdentifiedChip {
  const compact = compactChip(name);
  const exact = longestMatch(compact, CPU_INDEX);
  if (exact) return identified(exact, "exact");

  const ryzen = compact.match(/ryzen(?:threadripper(?:pro)?)?([3579])(\d{4,5})(x3d|xt|x|g|f|ge)?/);
  if (ryzen) {
    const family = ryzen[1];
    const model = Number.parseInt(ryzen[2], 10);
    const suffix = ryzen[3] ?? "";
    const rel = estimateRyzen(model, suffix);
    return {
      id: `ryzen-${family}-${model}${suffix}`,
      label: `Ryzen ${family} ${model}${suffix.toUpperCase()}`,
      rel,
      confidence: "family",
    };
  }

  const ultra = compact.match(/ultra([579])(\d{3})([kf]*)/);
  if (ultra) {
    const series = ultra[1];
    const num = Number.parseInt(ultra[2], 10);
    let rel = 122;
    if (series === "9" || num >= 280) rel = 158;
    else if (series === "7" || num >= 260) rel = 150;
    else if (num >= 245) rel = 138;
    else if (num >= 235) rel = 128;
    return {
      id: `ultra-${series}-${num}`,
      label: `Core Ultra ${series} ${num}`,
      rel,
      confidence: "family",
    };
  }

  const intel = compact.match(/(?:core)?i([3579])(\d{4,5})([kf]*)/);
  if (intel) {
    const family = intel[1];
    const model = Number.parseInt(intel[2].slice(0, 4), 10);
    const suffix = intel[3] ?? "";
    const rel = estimateIntel(family, model, suffix);
    return {
      id: `i${family}-${model}${suffix}`,
      label: `Core i${family}-${model}${suffix.toUpperCase()}`,
      rel,
      confidence: "family",
    };
  }

  if (compact.includes("athlon") || compact.includes("pentium") || compact.includes("celeron")) {
    return { id: "entry-cpu", label: "Entry CPU", rel: 42, confidence: "fallback" };
  }
  if (compact.includes("ryzen9") || compact.includes("corei9") || compact.includes("ultra9")) {
    return { id: "family-9", label: "High-end CPU", rel: 155, confidence: "fallback" };
  }
  if (compact.includes("ryzen7") || compact.includes("corei7") || compact.includes("ultra7")) {
    return { id: "family-7", label: "Upper mid CPU", rel: 140, confidence: "fallback" };
  }
  if (compact.includes("ryzen5") || compact.includes("corei5") || compact.includes("ultra5")) {
    return { id: "family-5", label: "Midrange CPU", rel: 118, confidence: "fallback" };
  }
  if (compact.includes("ryzen3") || compact.includes("corei3")) {
    return { id: "family-3", label: "Entry CPU", rel: 90, confidence: "fallback" };
  }
  return { id: "unknown-cpu", label: "CPU", rel: 100, confidence: "fallback" };
}
