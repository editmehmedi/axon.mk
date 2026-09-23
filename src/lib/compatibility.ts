export type CompatPart = {
  id: string;
  category: string;
  socket?: string | null;
  ramType?: string | null;
  wattage?: number | null;
  tdpWatts?: number | null;
  formFactor?: string | null;
  /** CPU: true when the box includes a stock cooler/fan. */
  includesCooler?: boolean | null;
  brand?: string | null;
  name: string;
  priceMkd?: number;
  stock?: number;
};

const NONE_PREFIX = "none:";

const NONE_LABELS: Record<string, string> = {
  CPU: "None — skip CPU",
  COOLER: "None — skip cooler",
  MOTHERBOARD: "None — skip motherboard",
  RAM: "None — skip RAM",
  GPU: "None — integrated graphics / no GPU",
  PSU: "None — skip PSU",
  CASE: "None — skip case",
  SSD: "None — skip storage",
};

/** Sentinel “skip this part” choice for any builder category. */
export function createNonePart(category: string): CompatPart {
  return {
    id: `${NONE_PREFIX}${category}`,
    category,
    name: NONE_LABELS[category] ?? "None — skip",
    brand: "—",
    tdpWatts: 0,
    priceMkd: 0,
    stock: 99,
  };
}

/** @deprecated use createNonePart("GPU") */
export function createNoneGpu(): CompatPart {
  return createNonePart("GPU");
}

export function isNonePart(part: CompatPart | null | undefined): boolean {
  return Boolean(part && String(part.id).startsWith(NONE_PREFIX));
}

/** @deprecated use isNonePart */
export function isNoneGpu(part: CompatPart | null | undefined): boolean {
  return isNonePart(part) && part?.category === "GPU";
}

export function isStockCoolerPart(part: {
  brand?: string | null;
  name?: string | null;
}): boolean {
  return part.brand === "OEM" && /included stock cooler/i.test(part.name ?? "");
}

/** CPU needs a separate cooler (tray / WOF / many Ryzen 5 X SKUs). */
export function cpuNeedsCooler(cpu: CompatPart | null | undefined): boolean {
  if (!cpu || isNonePart(cpu)) return false;
  return !cpu.includesCooler;
}

/**
 * Desktop CPUs that can display a picture without a graphics card.
 * Intel F/KF and AMD F have none. Ryzen 7000/9000 (non-F) and G/GT APUs do.
 */
export function cpuHasIntegratedGraphics(
  cpu: { brand?: string | null; name?: string | null } | null | undefined,
): boolean {
  if (!cpu?.name) return false;
  const text = `${cpu.brand ?? ""} ${cpu.name}`
    .toLowerCase()
    .replace(/\(.*?\)/g, " ");
  if (/threadripper/.test(text)) return false;

  const isAmd = /amd|ryzen|athlon|\ba[468]-?\s*series/.test(text);
  if (!isAmd && /intel|core|celeron|pentium|\bultra\b/.test(text)) {
    if (/(?:i[3579][-\s]?\d{4,5}|ultra\s*[579]\s*\d{3,5})(?:kf|f)\b/.test(text)) {
      return false;
    }
    return true;
  }

  if (isAmd) {
    if (/\b\d{3,4}g(?:e|t)?\b/.test(text)) return true;
    if (/\ba[468](?:-?\s*series)?\b/.test(text)) return true;
    if (/\b\d{4}f\b/.test(text)) return false;
    if (/\b[7-9]\d{3}(?:x3d\d?|x|xt)?\b/.test(text)) return true;
    return false;
  }

  return false;
}

export type CompatSelection = {
  CPU?: CompatPart | null;
  COOLER?: CompatPart | null;
  GPU?: CompatPart | null;
  MOTHERBOARD?: CompatPart | null;
  RAM?: CompatPart | null;
  PSU?: CompatPart | null;
  CASE?: CompatPart | null;
  /** One SSD model (qty via ssdQty), or a single None sentinel. */
  SSD?: CompatPart[] | null;
};

export type CompatIssue = {
  severity: "error" | "warning";
  message: string;
};

export const MAX_SSDS = 4;
export const MIN_RAM_STICKS = 1;
export const MAX_RAM_STICKS = 4;
export const DEFAULT_RAM_STICKS = 1;
export const MIN_SSD_QTY = 1;
export const MAX_SSD_QTY = 4;
export const DEFAULT_SSD_QTY = 1;

const SELECTION_PART_KEYS: (keyof CompatSelection)[] = [
  "CPU",
  "COOLER",
  "GPU",
  "MOTHERBOARD",
  "RAM",
  "PSU",
  "CASE",
  "SSD",
];

const RAM_MODULE_GB = new Set([4, 8, 12, 16, 24, 32, 48, 64, 96, 128]);

export type RamKitLayout = { modules: number; perModuleGb: number };

/**
 * Stick layout from the listing title.
 * Photos are not used — shops often show a 2-stick kit photo for a single DIMM.
 * Unlabeled capacity is treated as 1x{GB}.
 */
export function parseRamKitLayout(name: string): RamKitLayout | null {
  const n = name.replace(/\b\d+\s*Rx\s*\d+\b/gi, " ");
  const totalRaw = Number(n.match(/\b(\d+)\s*GB\b/i)?.[1]);
  const totalGb = Number.isFinite(totalRaw) && RAM_MODULE_GB.has(totalRaw) ? totalRaw : null;

  const explicit = n.match(/\b([1248])\s*[x×]\s*(\d+)\s*(?:GB)?\b/i);
  if (explicit) {
    const modules = Number(explicit[1]);
    const perModuleGb = Number(explicit[2]);
    if (RAM_MODULE_GB.has(perModuleGb)) return { modules, perModuleGb };
  }

  const kitOf = n.match(/\b(?:kit\s*of|комплет(?:\s*од)?)\s*([24])\b/i);
  if (kitOf && totalGb) {
    const modules = Number(kitOf[1]);
    const perModuleGb = totalGb / modules;
    if (RAM_MODULE_GB.has(perModuleGb)) return { modules, perModuleGb };
  }

  const pairWord = n.match(/\b(?:комплет|сет|кит|kit)\s*([24])\s*x\b/i);
  if (pairWord && totalGb) {
    const modules = Number(pairWord[1]);
    const perModuleGb = totalGb / modules;
    if (RAM_MODULE_GB.has(perModuleGb)) return { modules, perModuleGb };
  }

  const sku = n.match(/\bKF[A-Z0-9]*K(?:A)?([24])[-/](\d+)\b/i);
  if (sku) {
    const modules = Number(sku[1]);
    const cap = Number(sku[2]);
    const perModuleGb = cap / modules;
    if (RAM_MODULE_GB.has(perModuleGb)) return { modules, perModuleGb };
  }

  const gx = n.match(/(\d{1,2})GX([24])\b/i);
  if (gx) {
    const perModuleGb = Number(gx[1]);
    const modules = Number(gx[2]);
    if (RAM_MODULE_GB.has(perModuleGb)) return { modules, perModuleGb };
  }

  if (totalGb) return { modules: 1, perModuleGb: totalGb };
  return null;
}

export function ramKitLabel(name: string): string | null {
  const kit = parseRamKitLayout(name);
  if (!kit) return null;
  return `${kit.modules}×${kit.perModuleGb}GB`;
}

/** How many modules a RAM listing already includes (e.g. 2x8GB kit → 2). */
export function ramKitModuleCount(name: string): number {
  const kit = parseRamKitLayout(name);
  return kit && kit.modules >= 2 ? kit.modules : 1;
}

type MbSlots = { name?: string | null; formFactor?: string | null } | null | undefined;

/** DIMM slots from the motherboard name / form factor. */
export function motherboardRamSlots(mb: MbSlots): number | null {
  if (!mb?.name) return null;
  const n = mb.name;
  const ff = (mb.formFactor ?? "").toUpperCase();
  const explicit =
    n.match(/(\d+)\s*[x×]\s*DIMM/i) ||
    n.match(/\b(\d+)\s*DIMM\b/i) ||
    n.match(/(\d+)\s*RAM\s*SLOTS?/i);
  if (explicit) {
    const v = Number(explicit[1]);
    if (v === 2 || v === 4) return v;
  }
  if (ff === "ITX") return 2;
  if (/\bD2H\b|\bS2H\b/i.test(n)) return 2;
  if (/\bH610M-G\b/i.test(n)) return 2;
  if (/\bB860M\s+E\b/i.test(n)) return 2;
  if (/\b(H610M|H810M|A620M|B840M|A520M)\s+H(\s|$)/i.test(n)) return 2;
  if (/\b(H610M|H810M|A520M)\s+K(\s|$|V)/i.test(n)) return 2;
  return 4;
}

/** M.2 / SSD slots from the motherboard name (e.g. 2xM.2). */
export function motherboardSsdSlots(mb: MbSlots): number | null {
  if (!mb?.name) return null;
  const n = mb.name;
  const counted = n.match(/(\d+)\s*[x×]\s*M\.?2/i);
  if (counted) {
    const v = Number(counted[1]);
    if (Number.isFinite(v) && v >= 1 && v <= 5) return v;
  }
  if (/\bM\.2\b/i.test(n)) return 1;
  const ff = (mb.formFactor ?? "").toUpperCase();
  if (ff === "ITX") return 1;
  return 2;
}

export function ramQtySlotLimit(
  mb: MbSlots,
  ram?: { name: string } | null,
): number {
  const slots = motherboardRamSlots(mb) ?? MAX_RAM_STICKS;
  const perKit = ram ? ramKitModuleCount(ram.name) : 1;
  return Math.max(MIN_RAM_STICKS, Math.floor(slots / Math.max(1, perKit)));
}

export function ssdQtySlotLimit(mb: MbSlots): number {
  return motherboardSsdSlots(mb) ?? MAX_SSD_QTY;
}

export function clampRamQty(
  qty: number,
  stock?: number | null,
  slotLimit?: number | null,
): number {
  const stockCap = stock != null && stock > 0 ? stock : MAX_RAM_STICKS;
  const slotCap = slotLimit != null && slotLimit > 0 ? slotLimit : MAX_RAM_STICKS;
  const cap = Math.min(MAX_RAM_STICKS, stockCap, slotCap);
  const n = Number.isFinite(qty) ? Math.round(qty) : DEFAULT_RAM_STICKS;
  return Math.max(MIN_RAM_STICKS, Math.min(cap, n));
}

export function clampSsdQty(
  qty: number,
  stock?: number | null,
  slotLimit?: number | null,
): number {
  const stockCap = stock != null && stock > 0 ? stock : MAX_SSD_QTY;
  const slotCap = slotLimit != null && slotLimit > 0 ? slotLimit : MAX_SSD_QTY;
  const cap = Math.min(MAX_SSD_QTY, stockCap, slotCap);
  const n = Number.isFinite(qty) ? Math.round(qty) : DEFAULT_SSD_QTY;
  return Math.max(MIN_SSD_QTY, Math.min(cap, n));
}

/** Single DIMMs and kits both start at quantity 1. */
export function defaultRamQty(part: { name: string; stock?: number | null }): number {
  return clampRamQty(DEFAULT_RAM_STICKS, part.stock);
}

export function defaultSsdQty(part: { stock?: number | null }): number {
  return clampSsdQty(DEFAULT_SSD_QTY, part.stock);
}

export function getSsds(sel: CompatSelection): CompatPart[] {
  return (sel.SSD ?? []).filter((p) => !isNonePart(p));
}

export function ssdIsNone(sel: CompatSelection): boolean {
  const list = sel.SSD ?? [];
  return list.length === 1 && isNonePart(list[0]);
}

/** Flatten selected parts for pricing / orders (skips None sentinels). */
export function flattenSelection(sel: CompatSelection): CompatPart[] {
  const out: CompatPart[] = [];
  for (const key of SELECTION_PART_KEYS) {
    const val = sel[key];
    if (!val) continue;
    if (Array.isArray(val)) {
      out.push(...val.filter((p) => !isNonePart(p)));
    } else if (!isNonePart(val)) {
      out.push(val);
    }
  }
  return out;
}

export function selectionPriceMkd(sel: CompatSelection, ramQty = 1, ssdQty = 1): number {
  const ram = sel.RAM && !isNonePart(sel.RAM) ? sel.RAM : null;
  const ssdList = getSsds(sel);
  return flattenSelection(sel).reduce((sum, p) => {
    let qty = 1;
    if (p.category === "RAM" && ram && p.id === ram.id) {
      qty = clampRamQty(ramQty, p.stock, ramQtySlotLimit(sel.MOTHERBOARD, ram));
    } else if (p.category === "SSD" && ssdList.length === 1 && p.id === ssdList[0].id) {
      qty = clampSsdQty(ssdQty, p.stock, ssdQtySlotLimit(sel.MOTHERBOARD));
    }
    return sum + (p.priceMkd ?? 0) * qty;
  }, 0);
}

export function hasRealPsu(sel: CompatSelection): boolean {
  return Boolean(sel.PSU && !isNonePart(sel.PSU));
}

export function isStepComplete(sel: CompatSelection, category: keyof CompatSelection): boolean {
  if (category === "SSD" || category === "GPU") {
    // Storage and graphics are optional: no pick (or an explicit skip) still completes the build.
    return true;
  }
  if (category === "PSU") return hasRealPsu(sel);
  const v = sel[category];
  if (!v || Array.isArray(v)) return false;
  return true; // real part or None sentinel
}

/** Empty SSD step → explicit skip so checkout/pricing treat it as “no storage”. */
export function withOptionalSsdSkipped(sel: CompatSelection): CompatSelection {
  if (getSsds(sel).length > 0 || ssdIsNone(sel)) return sel;
  return { ...sel, SSD: [createNonePart("SSD")] };
}

/** Empty GPU step → explicit skip so checkout/pricing treat it as no graphics card. */
export function withOptionalGpuSkipped(sel: CompatSelection): CompatSelection {
  if (sel.GPU) return sel;
  return { ...sel, GPU: createNonePart("GPU") };
}

export function stepHasNone(sel: CompatSelection, category: keyof CompatSelection): boolean {
  if (category === "SSD") return ssdIsNone(sel);
  const v = sel[category];
  return Boolean(v && !Array.isArray(v) && isNonePart(v));
}

/** Case can fit motherboard if same form factor, or case is larger (ATX case fits mATX). */
function caseFitsBoard(boardFF?: string | null, caseFF?: string | null): boolean {
  if (!boardFF || !caseFF) return true;
  if (boardFF === caseFF) return true;
  if (caseFF === "ATX" && (boardFF === "mATX" || boardFF === "ITX")) return true;
  if (caseFF === "mATX" && boardFF === "ITX") return true;
  return false;
}

export type PowerQty = { ramQty?: number; ssdQty?: number };

export type PowerLine = {
  category: "CPU" | "GPU" | "MOTHERBOARD" | "RAM" | "COOLER" | "SSD" | "CASE";
  watts: number;
  qty?: number;
};

function realPart(
  part: CompatPart | CompatPart[] | null | undefined,
): CompatPart | null {
  if (!part || Array.isArray(part) || isNonePart(part)) return null;
  return part;
}

function motherboardDrawWatts(mb: CompatPart): number {
  const ff = (mb.formFactor ?? "").toUpperCase();
  if (/\bITX\b/.test(ff)) return 35;
  if (/\bM-?ATX\b|MICRO/.test(ff)) return 45;
  return 50;
}

/** Fan/pump draw — cooler TDP rating is cooling capacity, not consumption. */
function coolerDrawWatts(cooler: CompatPart): number {
  if (isStockCoolerPart(cooler)) return 3;
  const n = `${cooler.brand ?? ""} ${cooler.name}`;
  if (/\b(AIO|liquid|water[\s-]?cool)/i.test(n)) return 18;
  if (/\b(360|280|240)\s*mm\b/i.test(n)) return 16;
  return 8;
}

function ramDrawWatts(ram: CompatPart, ramQty: number): { watts: number; qty: number } {
  const sticks = ramKitModuleCount(ram.name) * Math.max(1, ramQty);
  const perStick = /DDR5/i.test(`${ram.ramType ?? ""} ${ram.name}`) ? 5 : 4;
  return { watts: sticks * perStick, qty: sticks };
}

function ssdDrawWatts(ssd: CompatPart, ssdQty: number): { watts: number; qty: number } {
  const qty = Math.max(1, ssdQty);
  const per = /\bNVMe\b|\bM\.?2\b/i.test(ssd.name) ? 6 : 4;
  return { watts: qty * per, qty };
}

/** Per-part draw from the current build (CPU/GPU TDP + board, RAM, cooler, storage, case). */
export function estimatedPowerBreakdown(
  sel: CompatSelection,
  qty?: PowerQty,
): { total: number; lines: PowerLine[] } {
  const lines: PowerLine[] = [];
  const cpu = realPart(sel.CPU);
  const gpu = realPart(sel.GPU);
  const mb = realPart(sel.MOTHERBOARD);
  const ram = realPart(sel.RAM);
  const cooler = realPart(sel.COOLER);
  const pcCase = realPart(sel.CASE);
  const ssds = getSsds(sel);
  const ramQty = qty?.ramQty ?? 1;
  const ssdQty = qty?.ssdQty ?? (ssds.length || 1);

  if (cpu) lines.push({ category: "CPU", watts: cpu.tdpWatts && cpu.tdpWatts > 0 ? cpu.tdpWatts : 65 });
  if (gpu) lines.push({ category: "GPU", watts: gpu.tdpWatts && gpu.tdpWatts > 0 ? gpu.tdpWatts : 150 });
  if (mb) lines.push({ category: "MOTHERBOARD", watts: motherboardDrawWatts(mb) });
  if (ram) {
    const { watts, qty: sticks } = ramDrawWatts(ram, ramQty);
    lines.push({ category: "RAM", watts, qty: sticks });
  }
  if (cooler) lines.push({ category: "COOLER", watts: coolerDrawWatts(cooler) });
  if (ssds.length) {
    const { watts, qty: count } = ssdDrawWatts(ssds[0], ssds.length > 1 ? ssds.length : ssdQty);
    lines.push({ category: "SSD", watts, qty: count });
  }
  if (pcCase) lines.push({ category: "CASE", watts: 10 });

  return {
    total: lines.reduce((sum, line) => sum + line.watts, 0),
    lines,
  };
}

export function estimatedUsageWatts(sel: CompatSelection, qty?: PowerQty): number {
  return estimatedPowerBreakdown(sel, qty).total;
}

export function estimatedPsuWatts(sel: CompatSelection, qty?: PowerQty): number {
  return Math.ceil((estimatedUsageWatts(sel, qty) || 150) * 1.25);
}

/** Expected RAM generation(s) for a CPU socket when no motherboard is picked yet. */
export function ramTypesForCpuSocket(socket?: string | null): string[] | null {
  if (!socket) return null;
  const s = socket.trim().toUpperCase();
  if (s === "FM2+" || s === "LGA1150" || s === "LGA1155" || s === "LGA1156") return ["DDR3"];
  if (s === "AM4" || s === "LGA1200" || s === "LGA1151") return ["DDR4"];
  if (s === "AM5" || s === "LGA1851") return ["DDR5"];
  // LGA1700 boards exist in both DDR4 and DDR5
  if (s === "LGA1700") return ["DDR4", "DDR5"];
  return null;
}

/** Keep only parts that fit the current selection (CPU socket, RAM type, PSU wattage, …). */
export function isCompatibleOption(
  part: CompatPart,
  sel: CompatSelection,
  category: string
): boolean {
  if (isNonePart(part)) return true;

  const cpu = sel.CPU && !isNonePart(sel.CPU) ? sel.CPU : null;
  const mb = sel.MOTHERBOARD && !isNonePart(sel.MOTHERBOARD) ? sel.MOTHERBOARD : null;
  const gpu = sel.GPU && !isNonePart(sel.GPU) ? sel.GPU : null;
  const ram = sel.RAM && !isNonePart(sel.RAM) ? sel.RAM : null;

  if (category === "MOTHERBOARD") {
    if (cpu?.socket && part.socket && part.socket !== cpu.socket) return false;
    if (ram?.ramType && part.ramType && part.ramType !== ram.ramType) return false;
  }

  if (category === "CPU") {
    if (mb?.socket && part.socket && part.socket !== mb.socket) return false;
    if (ram?.ramType && part.socket) {
      const allowed = ramTypesForCpuSocket(part.socket);
      if (allowed && !allowed.includes(ram.ramType)) return false;
    }
  }

  if (category === "RAM") {
    // Motherboard wins when present (exact DDR4/DDR5).
    if (mb?.ramType && part.ramType && part.ramType !== mb.ramType) return false;
    // With only a CPU picked (e.g. AM4 5600X), hide incompatible RAM generations.
    if (!mb?.ramType && cpu?.socket && part.ramType) {
      const allowed = ramTypesForCpuSocket(cpu.socket);
      if (allowed && !allowed.includes(part.ramType)) return false;
    }
  }

  if (category === "CASE") {
    if (mb?.formFactor && part.formFactor && !caseFitsBoard(mb.formFactor, part.formFactor)) {
      return false;
    }
  }

  if (category === "PSU") {
    const need = estimatedPsuWatts({ ...sel, GPU: gpu ?? sel.GPU });
    if (part.wattage && part.wattage < need) return false;
  }

  if (category === "COOLER") {
    if (isStockCoolerPart(part)) {
      if (!cpu?.includesCooler) return false;
      return true;
    }
    // Socket: e.g. CK-11509 is Intel-only — block with Ryzen AM5
    if (cpu?.socket && part.socket && !coolerSupportsSocket(part.socket, cpu.socket)) {
      return false;
    }
    const cpuTdp = cpu?.tdpWatts;
    if (cpuTdp && part.tdpWatts && part.tdpWatts < cpuTdp) return false;
    // Tray / WOF CPUs need a real heatsink cooler, not a tiny stock-style fan
    if (cpu && cpuNeedsCooler(cpu) && part.tdpWatts && part.tdpWatts < 100) {
      return false;
    }
  }

  return true;
}

function coolerSupportsSocket(
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

export function filterCompatibleParts<T extends CompatPart>(
  parts: T[],
  category: string,
  sel: CompatSelection
): T[] {
  return parts.filter(
    (p) => p.category === category && isCompatibleOption(p, sel, category)
  );
}

/** Drop later picks that no longer match after changing an earlier part. */
export function pruneIncompatibleSelection(
  sel: CompatSelection,
  changed: keyof CompatSelection
): CompatSelection {
  const next: CompatSelection = { ...sel };

  const real = (p: CompatPart | null | undefined) =>
    p && !isNonePart(p) ? p : null;

  if (changed === "CPU") {
    if (
      real(next.MOTHERBOARD) &&
      !isCompatibleOption(next.MOTHERBOARD!, next, "MOTHERBOARD")
    ) {
      next.MOTHERBOARD = null;
      next.RAM = null;
      next.CASE = null;
    }
    if (real(next.RAM) && !isCompatibleOption(next.RAM!, next, "RAM")) next.RAM = null;
    if (real(next.PSU) && !isCompatibleOption(next.PSU!, next, "PSU")) next.PSU = null;
    if (real(next.COOLER) && !isCompatibleOption(next.COOLER!, next, "COOLER")) {
      next.COOLER = null;
    }
  }

  if (changed === "MOTHERBOARD") {
    if (real(next.RAM) && !isCompatibleOption(next.RAM!, next, "RAM")) next.RAM = null;
    if (real(next.CASE) && !isCompatibleOption(next.CASE!, next, "CASE")) next.CASE = null;
  }

  if (changed === "RAM") {
    if (
      real(next.MOTHERBOARD) &&
      !isCompatibleOption(next.MOTHERBOARD!, next, "MOTHERBOARD")
    ) {
      next.MOTHERBOARD = null;
    }
  }

  if (changed === "GPU") {
    if (real(next.PSU) && !isCompatibleOption(next.PSU!, next, "PSU")) next.PSU = null;
  }

  return next;
}

export function compatibilityFilterHint(sel: CompatSelection, category: string): string | null {
  const cpu = sel.CPU && !isNonePart(sel.CPU) ? sel.CPU : null;
  const mb = sel.MOTHERBOARD && !isNonePart(sel.MOTHERBOARD) ? sel.MOTHERBOARD : null;
  const gpu = sel.GPU && !isNonePart(sel.GPU) ? sel.GPU : null;

  if (category === "MOTHERBOARD" && cpu?.socket) {
    return `socket ${cpu.socket}`;
  }
  if (category === "RAM" && mb?.ramType) {
    const slots = motherboardRamSlots(mb);
    return slots ? `${mb.ramType} · ${slots} DIMM` : mb.ramType;
  }
  if (category === "RAM" && !mb?.ramType && cpu?.socket) {
    const allowed = ramTypesForCpuSocket(cpu.socket);
    if (allowed?.length === 1) return allowed[0];
    if (allowed?.length) return allowed.join(" / ");
  }
  if (category === "CASE" && mb?.formFactor) {
    return mb.formFactor;
  }
  if (category === "PSU") {
    if (cpu || gpu) return `≥${estimatedPsuWatts(sel)}W`;
    return null;
  }
  if (category === "CPU" && mb?.socket) {
    return `socket ${mb.socket}`;
  }
  if (category === "COOLER") {
    if (cpu && cpuNeedsCooler(cpu)) {
      return cpu.tdpWatts
        ? `need heatsink cooler ≥${Math.max(cpu.tdpWatts, 100)}W · ${cpu.socket ?? ""}`
        : "need proper cooler (not fan-only)";
    }
    if (cpu?.tdpWatts) {
      return `≥${cpu.tdpWatts}W · ${cpu.socket ?? ""}`.trim();
    }
  }
  if (category === "SSD") {
    if (ssdIsNone(sel)) return "skipped";
    const slots = motherboardSsdSlots(sel.MOTHERBOARD);
    if (slots) return `${slots} SSD slot${slots === 1 ? "" : "s"}`;
    return "pick SSD quantity (or Next to skip)";
  }
  return "or Next to skip";
}

export function checkCompatibility(
  sel: CompatSelection,
  qty?: { ramQty?: number; ssdQty?: number },
): CompatIssue[] {
  const issues: CompatIssue[] = [];
  const cpu = sel.CPU && !isNonePart(sel.CPU) ? sel.CPU : null;
  const mb = sel.MOTHERBOARD && !isNonePart(sel.MOTHERBOARD) ? sel.MOTHERBOARD : null;
  const ram = sel.RAM && !isNonePart(sel.RAM) ? sel.RAM : null;
  const gpu = sel.GPU && !isNonePart(sel.GPU) ? sel.GPU : null;
  const psu = sel.PSU && !isNonePart(sel.PSU) ? sel.PSU : null;
  const pcCase = sel.CASE && !isNonePart(sel.CASE) ? sel.CASE : null;
  const cooler = sel.COOLER && !isNonePart(sel.COOLER) ? sel.COOLER : null;
  const coolerSkipped = Boolean(sel.COOLER && isNonePart(sel.COOLER));
  const ssds = getSsds(sel);
  const ramQty = qty?.ramQty ?? 1;
  const ssdQty = qty?.ssdQty ?? (ssds.length || 1);

  if (cpu && mb) {
    if (cpu.socket && mb.socket && cpu.socket !== mb.socket) {
      issues.push({
        severity: "error",
        message: `Socket mismatch: CPU (${cpu.socket}) ↔ Motherboard (${mb.socket})`,
      });
    }
  }

  if (cpu && cpuNeedsCooler(cpu) && !cooler && !coolerSkipped) {
    issues.push({
      severity: "error",
      message: `CPU has no stock fan — pick a cooler (e.g. ${cpu.name})`,
    });
  }

  if (cpu && cooler) {
    if (cooler.socket && cpu.socket && !coolerSupportsSocket(cooler.socket, cpu.socket)) {
      issues.push({
        severity: "error",
        message: `Cooler socket mismatch: cooler supports ${cooler.socket}, CPU is ${cpu.socket}`,
      });
    } else if (isStockCoolerPart(cooler) && cpuNeedsCooler(cpu)) {
      issues.push({
        severity: "error",
        message: "This CPU ships without a cooler — choose an aftermarket cooler",
      });
    } else if (
      cpuNeedsCooler(cpu) &&
      cooler.tdpWatts &&
      cooler.tdpWatts < 100
    ) {
      issues.push({
        severity: "error",
        message: "This CPU needs a proper heatsink cooler, not a stock-style fan cooler",
      });
    } else if (
      !isStockCoolerPart(cooler) &&
      cpu.tdpWatts &&
      cooler.tdpWatts &&
      cooler.tdpWatts < cpu.tdpWatts
    ) {
      issues.push({
        severity: "error",
        message: `Cooler too weak: CPU ${cpu.tdpWatts}W TDP, cooler rated ${cooler.tdpWatts}W`,
      });
    }
  }

  if (cpu && ram && ram.ramType) {
    const allowed = ramTypesForCpuSocket(cpu.socket);
    if (allowed && !allowed.includes(ram.ramType)) {
      issues.push({
        severity: "error",
        message: `RAM type mismatch: CPU (${cpu.socket ?? "unknown"}) needs ${allowed.join("/")} ↔ RAM (${ram.ramType})`,
      });
    }
  }

  if (mb && ram) {
    if (mb.ramType && ram.ramType && mb.ramType !== ram.ramType) {
      issues.push({
        severity: "error",
        message: `RAM type mismatch: Motherboard (${mb.ramType}) ↔ RAM (${ram.ramType})`,
      });
    }
  }

  if (mb && pcCase) {
    if (mb.formFactor && pcCase.formFactor && !caseFitsBoard(mb.formFactor, pcCase.formFactor)) {
      issues.push({
        severity: "error",
        message: `Form factor mismatch: MB ${mb.formFactor} / Case ${pcCase.formFactor}`,
      });
    }
  }

  const ramSlots = motherboardRamSlots(mb);
  if (ram && ramSlots) {
    const used = ramKitModuleCount(ram.name) * ramQty;
    if (used > ramSlots) {
      issues.push({
        severity: "error",
        message: `Your motherboard has ${ramSlots} RAM slots`,
      });
    }
  }

  const ssdSlots = motherboardSsdSlots(mb);
  const ssdCount = ssds.length > 1 ? ssds.length : ssdQty;
  if (ssds.length && ssdSlots && ssdCount > ssdSlots) {
    issues.push({
      severity: "error",
      message: `Your motherboard has ${ssdSlots} SSD slots`,
    });
  }

  if (ssds.length > MAX_SSD_QTY || ssdQty > MAX_SSD_QTY) {
    issues.push({
      severity: "error",
      message: `Max ${MAX_SSD_QTY} SSDs allowed`,
    });
  }

  if (psu) {
    const estimated = estimatedPsuWatts(sel, { ramQty, ssdQty });
    if (psu.wattage && psu.wattage < estimated) {
      issues.push({
        severity: "error",
        message: `PSU too weak: need ~${estimated}W, selected ${psu.wattage}W`,
      });
    } else if (psu.wattage && psu.wattage < estimated + 100) {
      issues.push({
        severity: "warning",
        message: `PSU close to limit (~${estimated}W needed). More headroom recommended.`,
      });
    }
  }

  void gpu;
  return issues;
}

export function hasBlockingErrors(issues: CompatIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
