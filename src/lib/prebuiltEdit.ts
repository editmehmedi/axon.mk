import { BUILDER_STEPS } from "@/lib/constants";
import { createNonePart, isStockCoolerPart, type CompatPart, type CompatSelection } from "@/lib/compatibility";

export type PrebuiltPartLabels = {
  cpuLabel: string;
  coolerLabel?: string | null;
  motherboardLabel?: string | null;
  ramLabel: string;
  gpuLabel: string;
  ssdLabel: string;
  psuLabel?: string | null;
  caseLabel?: string | null;
};

const LABEL_KEY: Record<(typeof BUILDER_STEPS)[number], keyof PrebuiltPartLabels> = {
  CPU: "cpuLabel",
  COOLER: "coolerLabel",
  MOTHERBOARD: "motherboardLabel",
  RAM: "ramLabel",
  GPU: "gpuLabel",
  PSU: "psuLabel",
  CASE: "caseLabel",
  SSD: "ssdLabel",
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/\s+/g, " ")
    .trim();
}

function partLine(part: CompatPart): string {
  return `${part.brand ?? ""} ${part.name}`.replace(/\s+/g, " ").trim();
}

function stripQty(label: string): { text: string; qty?: number } {
  const qtyMatch = label.trim().match(/^(.*)\s*[×x]\s*(\d+)\s*$/i);
  if (!qtyMatch) return { text: label.trim() };
  return { text: qtyMatch[1].trim(), qty: Number(qtyMatch[2]) || 1 };
}

function scorePart(part: CompatPart, label: string): number {
  const line = normalize(partLine(part));
  const want = normalize(label);
  if (!want || !line) return 0;
  if (line === want) return 10_000;
  if (line.startsWith(want) || want.startsWith(line)) return 5_000 + Math.min(line.length, want.length);
  if (line.includes(want) || want.includes(line)) return 4_000 + Math.min(line.length, want.length);

  const tokens = want.split(/[^a-z0-9]+/).filter((token) => token.length >= 2);
  const modelTokens = tokens.filter((token) => /\d/.test(token));
  if (!modelTokens.length) return 0;
  const compact = line.replace(/[^a-z0-9]/g, "");
  if (modelTokens.some((token) => !compact.includes(token))) return 0;
  let hits = 0;
  for (const token of tokens) {
    if (compact.includes(token)) hits++;
  }
  if (hits < 2) return 0;
  const wantCompact = want.replace(/[^a-z0-9]/g, "");
  let penalty = 0;
  for (const extra of ["ti", "xtx", "xt", "super"]) {
    if (compact.includes(extra) !== wantCompact.includes(extra)) penalty += 80;
  }
  return hits * 100 - penalty;
}

/** Map a ready PC's spec lines onto catalog parts so the builder can edit them. */
export function selectionFromPrebuiltLabels(
  parts: CompatPart[],
  labels: PrebuiltPartLabels,
): { selection: CompatSelection; ramQtyById: Record<string, number> } {
  const selection: CompatSelection = {};
  const ramQtyById: Record<string, number> = {};

  for (const cat of BUILDER_STEPS) {
    const raw = (labels[LABEL_KEY[cat]] ?? "").trim();
    if (!raw) continue;
    if (cat === "GPU" && /integrated|\bigpu\b/i.test(raw)) {
      selection.GPU = createNonePart("GPU");
      continue;
    }
    if (cat === "COOLER" && /included|stock cooler|stock intel|stock wraith/i.test(raw)) {
      const stock = parts.find((part) => part.category === "COOLER" && isStockCoolerPart(part));
      selection.COOLER = stock ?? createNonePart("COOLER");
      continue;
    }

    const { text, qty } = cat === "RAM" ? stripQty(raw) : { text: raw };
    const inStock = parts.filter((part) => part.category === cat && (part.stock ?? 0) > 0);
    const pool = inStock.length ? inStock : parts.filter((part) => part.category === cat);
    const hit = pool
      .map((part) => ({ part, score: scorePart(part, text) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || (a.part.priceMkd ?? 0) - (b.part.priceMkd ?? 0))[0]?.part;
    if (!hit) continue;
    if (cat === "SSD") selection.SSD = [hit];
    else selection[cat] = hit;
    if (cat === "RAM" && qty && qty > 1) ramQtyById[hit.id] = qty;
  }

  return { selection, ramQtyById };
}
