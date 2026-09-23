import { identifyCpu, identifyGpu } from "@/lib/chipCatalog";
import {
  checkCompatibility,
  cpuHasIntegratedGraphics,
  cpuNeedsCooler,
  filterCompatibleParts,
  getSsds,
  hasBlockingErrors,
  isNonePart,
  isStockCoolerPart,
  parseRamKitLayout,
  ramKitModuleCount,
  ramQtySlotLimit,
  selectionPriceMkd,
  clampRamQty,
  type CompatPart,
  type CompatSelection,
} from "@/lib/compatibility";

export const AI_USE_CASES = ["gaming", "work", "office", "content", "streaming"] as const;
export type AiUseCase = (typeof AI_USE_CASES)[number];

export const AI_MIN_BUDGET_MKD = 20000;

export type AiBuildFocus = "gpu" | "cpu" | "balanced" | "integrated";

export type AiCatalogPart = CompatPart & {
  brand?: string | null;
  priceMkd: number;
  stock: number;
  imageUrl?: string | null;
};

export type AiBuildLine = {
  id: string;
  category: string;
  brand: string;
  name: string;
  priceMkd: number;
  qty: number;
  imageUrl: string | null;
  socket: string | null;
  ramType: string | null;
  wattage: number | null;
  tdpWatts: number | null;
  formFactor: string | null;
  includesCooler: boolean;
};

export type AiBuild = {
  useCase: AiUseCase;
  focus: AiBuildFocus;
  budgetMkd: number;
  assemblyFeeMkd: number;
  partsCostMkd: number;
  totalMkd: number;
  ramGb: number;
  storageGb: number;
  cpuName: string;
  gpuName: string | null;
  lines: AiBuildLine[];
};

type Weights = {
  gpu: number;
  cpu: number;
  mb: number;
  ram: number;
  ssd: number;
  psu: number;
  pcCase: number;
  cooler: number;
  wantGpu: boolean;
  ramGb: number;
  ssdGb: number;
};

const WEIGHTS: Record<AiUseCase, Weights> = {
  gaming: {
    gpu: 0.42,
    cpu: 0.18,
    mb: 0.09,
    ram: 0.08,
    ssd: 0.07,
    psu: 0.07,
    pcCase: 0.06,
    cooler: 0.03,
    wantGpu: true,
    ramGb: 16,
    ssdGb: 1000,
  },
  work: {
    gpu: 0.12,
    cpu: 0.26,
    mb: 0.12,
    ram: 0.16,
    ssd: 0.14,
    psu: 0.07,
    pcCase: 0.08,
    cooler: 0.05,
    wantGpu: true,
    ramGb: 32,
    ssdGb: 1000,
  },
  office: {
    gpu: 0,
    cpu: 0.3,
    mb: 0.16,
    ram: 0.14,
    ssd: 0.16,
    psu: 0.1,
    pcCase: 0.1,
    cooler: 0.04,
    wantGpu: false,
    ramGb: 16,
    ssdGb: 500,
  },
  content: {
    gpu: 0.28,
    cpu: 0.22,
    mb: 0.08,
    ram: 0.16,
    ssd: 0.12,
    psu: 0.06,
    pcCase: 0.05,
    cooler: 0.03,
    wantGpu: true,
    ramGb: 32,
    ssdGb: 1000,
  },
  streaming: {
    gpu: 0.32,
    cpu: 0.22,
    mb: 0.08,
    ram: 0.12,
    ssd: 0.09,
    psu: 0.08,
    pcCase: 0.05,
    cooler: 0.04,
    wantGpu: true,
    ramGb: 32,
    ssdGb: 1000,
  },
};

function chipRel(name: string, kind: "cpu" | "gpu"): number {
  return kind === "cpu" ? identifyCpu(name).rel : identifyGpu(name).rel;
}

function storageGb(name: string): number {
  const tb = name.match(/(\d+(?:[.,]\d+)?)\s*TB\b/i);
  if (tb) return Math.round(Number(tb[1].replace(",", ".")) * 1000);
  const gb = name.match(/(\d+)\s*GB\b/i);
  return gb ? Number(gb[1]) : 0;
}

function ramGbFor(name: string, qty: number): number {
  const kit = parseRamKitLayout(name);
  if (!kit) return 0;
  return kit.modules * kit.perModuleGb * qty;
}

function buyable(part: AiCatalogPart): boolean {
  if (isNonePart(part) || isStockCoolerPart(part)) return false;
  return (part.stock ?? 0) > 0 && (part.priceMkd ?? 0) > 0;
}

function priceOf(part: CompatPart | null | undefined): number {
  if (!part || isNonePart(part)) return 0;
  return part.priceMkd ?? 0;
}

function pickNearTarget<T extends { priceMkd: number }>(
  items: T[],
  target: number,
  maxPrice: number,
  score: (item: T) => number,
): T | null {
  const affordable = items.filter((item) => item.priceMkd > 0 && item.priceMkd <= maxPrice);
  if (!affordable.length) return null;
  const lo = target * 0.5;
  const hi = Math.min(maxPrice, Math.max(target * 1.25, lo));
  const band = affordable.filter((item) => item.priceMkd >= lo && item.priceMkd <= hi);
  const pool = band.length ? band : affordable;
  return pool.slice().sort((a, b) => {
    const delta = score(b) - score(a);
    if (Math.abs(delta) > 0.75) return delta;
    return Math.abs(a.priceMkd - target) - Math.abs(b.priceMkd - target);
  })[0];
}

function spreadPicks<T extends { priceMkd: number }>(
  items: T[],
  score: (item: T) => number,
  minPrice: number,
  maxPrice: number,
  count: number,
): T[] {
  let pool = items.filter((item) => item.priceMkd >= minPrice && item.priceMkd <= maxPrice);
  if (pool.length < 2) {
    pool = items.filter((item) => item.priceMkd > 0 && item.priceMkd <= maxPrice);
  }
  if (!pool.length) return [];
  pool.sort((a, b) => a.priceMkd - b.priceMkd);
  const picks: T[] = [];
  const steps = Math.min(count, pool.length);
  for (let i = 0; i < steps; i++) {
    const idx = Math.round((i * (pool.length - 1)) / Math.max(1, steps - 1));
    const item = pool[idx];
    if (item && !picks.includes(item)) picks.push(item);
  }
  const best = pool.slice().sort((a, b) => score(b) - score(a))[0];
  if (best && !picks.includes(best)) {
    picks[picks.length - 1] = best;
  }
  return picks;
}

type Filled = { sel: CompatSelection; ramQty: number; cost: number };

function completeBuild(
  catalog: AiCatalogPart[],
  useCase: AiUseCase,
  partsBudget: number,
  cpu: AiCatalogPart,
  gpu: AiCatalogPart | null,
): Filled | null {
  const weights = WEIGHTS[useCase];
  const sel: CompatSelection = {
    CPU: cpu,
    GPU: gpu ?? undefined,
  };
  let remaining = partsBudget - priceOf(cpu) - priceOf(gpu);
  if (remaining < 8000) return null;

  if (!cpuNeedsCooler(cpu)) {
    const stock = catalog.find((part) => part.category === "COOLER" && isStockCoolerPart(part));
    if (stock) sel.COOLER = stock;
  } else {
    const cpuTdp = cpu.tdpWatts ?? 65;
    const fitsCooler = (part: AiCatalogPart, priceCap: number) => {
      if (!buyable(part) || part.priceMkd > priceCap) return false;
      const capacity = coolerCapacity(part);
      if (capacity != null && capacity < cpuTdp) return false;
      if (capacity == null && cpuTdp >= 105) return false;
      if (cpuTdp >= 90 && /alpine|low-profile|\blp\b/i.test(part.name)) return false;
      return true;
    };
    const coolers = filterCompatibleParts(catalog, "COOLER", sel).filter((part) =>
      fitsCooler(part, remaining - 10000),
    );
    const pool = coolers.length
      ? coolers
      : filterCompatibleParts(catalog, "COOLER", sel).filter((part) => fitsCooler(part, remaining - 6000));
    if (!pool.length) return null;
    sel.COOLER = pool.slice().sort((a, b) => a.priceMkd - b.priceMkd)[0];
    remaining -= priceOf(sel.COOLER);
  }

  const boards = filterCompatibleParts(catalog, "MOTHERBOARD", sel).filter(
    (part) => buyable(part) && (!cpu.socket || !part.socket || part.socket === cpu.socket),
  );
  const socketBoards = cpu.socket ? boards.filter((part) => part.socket === cpu.socket) : boards;
  const boardPool = socketBoards.length ? socketBoards : boards;
  const board = pickNearTarget(
    boardPool.filter((part) => part.priceMkd <= remaining - 9000),
    Math.round(partsBudget * weights.mb),
    remaining - 9000,
    (part) => {
      let score = 0;
      if (part.formFactor === "ATX") score += useCase === "office" ? 0.2 : 1;
      if (part.formFactor === "mATX") score += 0.8;
      if (/wi-?fi/i.test(part.name)) score += 0.4;
      return score;
    },
  );
  if (!board) return null;
  sel.MOTHERBOARD = board;
  remaining -= board.priceMkd;

  const ramTarget =
    partsBudget > 110000 && useCase !== "office" ? Math.max(weights.ramGb, 32) : weights.ramGb;
  const rams = filterCompatibleParts(catalog, "RAM", sel).filter((part) => buyable(part));
  type RamOpt = { part: AiCatalogPart; qty: number; gb: number; cost: number };
  const ramOpts: RamOpt[] = [];
  for (const part of rams) {
    const maxQty = clampRamQty(4, part.stock, ramQtySlotLimit(sel.MOTHERBOARD, part));
    for (let qty = 1; qty <= maxQty; qty++) {
      const gb = ramGbFor(part.name, qty);
      const cost = part.priceMkd * qty;
      if (gb > 0 && cost <= remaining - 7000) ramOpts.push({ part, qty, gb, cost });
    }
  }
  ramOpts.sort((a, b) => ramScore(b, ramTarget, partsBudget * weights.ram) - ramScore(a, ramTarget, partsBudget * weights.ram));
  const ram = ramOpts[0];
  if (!ram) return null;
  sel.RAM = ram.part;
  const ramQty = ram.qty;
  remaining -= ram.cost;

  const ssdTarget = partsBudget > 100000 && useCase !== "office" ? Math.max(weights.ssdGb, 1000) : weights.ssdGb;
  const ssds = filterCompatibleParts(catalog, "SSD", sel).filter(
    (part) => buyable(part) && part.priceMkd <= remaining - 4500,
  );
  const ssd = ssds.slice().sort((a, b) => ssdScore(b, ssdTarget, partsBudget) - ssdScore(a, ssdTarget, partsBudget))[0];
  if (!ssd) return null;
  sel.SSD = [ssd];
  remaining -= ssd.priceMkd;

  const psus = filterCompatibleParts(catalog, "PSU", sel).filter(
    (part) => buyable(part) && part.wattage && part.priceMkd <= remaining - 2200,
  );
  const gpuDraw = gpu?.tdpWatts && gpu.tdpWatts > 0 ? gpu.tdpWatts : gpu ? 160 : 0;
  const wattFloor = gpu ? Math.max(550, Math.ceil(gpuDraw * 2 + 200)) : 450;
  const psuPool = psus.filter((part) => (part.wattage ?? 0) >= wattFloor);
  const psu = psuPool.slice().sort((a, b) => a.priceMkd - b.priceMkd || (a.wattage ?? 0) - (b.wattage ?? 0))[0];
  if (!psu) return null;
  sel.PSU = psu;
  remaining -= psu.priceMkd;

  const cases = filterCompatibleParts(catalog, "CASE", sel).filter(
    (part) => buyable(part) && part.priceMkd <= remaining,
  );
  const pcCase = pickNearTarget(
    cases,
    Math.min(remaining, Math.max(2500, Math.round(partsBudget * weights.pcCase))),
    remaining,
    (part) => (part.formFactor ? 1 : 0),
  );
  if (!pcCase) return null;
  sel.CASE = pcCase;

  if (!gpu) sel.GPU = undefined;

  const issues = checkCompatibility(sel, { ramQty, ssdQty: 1 });
  if (hasBlockingErrors(issues)) return null;
  const cost = selectionPriceMkd(sel, ramQty, 1);
  if (cost <= 0 || cost > partsBudget) return null;
  if (!getSsds(sel).length) return null;
  return { sel, ramQty, cost };
}

function ramScore(opt: { gb: number; cost: number; part: AiCatalogPart; qty: number }, target: number, priceTarget: number): number {
  const kit = parseRamKitLayout(opt.part.name);
  const sticks = ramKitModuleCount(opt.part.name) * opt.qty;
  const perModule = kit?.perModuleGb ?? 0;
  let score = opt.gb >= target ? 50 - Math.min(20, (opt.gb - target) / 4) : opt.gb / 2;
  if (perModule >= 8) score += 40;
  else score -= 50;
  if (sticks === 2) score += 14;
  else if (sticks === 1 && perModule >= 16) score += 4;
  const speed = ramSpeedMhz(opt.part.name);
  if (speed >= 5200) score += 8;
  else if (speed >= 3200) score += 5;
  else if (speed > 0 && speed < 3000) score -= 8;
  score -= Math.abs(opt.cost - priceTarget) / 8000;
  return score;
}

function ssdScore(part: AiCatalogPart, target: number, partsBudget: number): number {
  const gb = storageGb(part.name);
  let score = gb >= target ? 40 - Math.min(12, Math.abs(gb - target) / 400) : gb >= target / 2 ? 12 : gb / 80;
  if (/nvme/i.test(part.name)) score += 16;
  else if (/m\.?2/i.test(part.name)) score += 4;
  score -= (part.priceMkd / Math.max(partsBudget, 1)) * 12;
  return score;
}

function pairOk(cpu: AiCatalogPart, gpu: AiCatalogPart, useCase: AiUseCase, relaxed: boolean): boolean {
  const cpuR = chipRel(cpu.name, "cpu");
  const gpuR = chipRel(gpu.name, "gpu");
  const ratio = useCase === "work" ? 0.55 : useCase === "content" ? 0.7 : 0.8;
  const floor = relaxed ? ratio - 0.12 : ratio;
  return cpuR >= gpuR * floor;
}

function coolerCapacity(part: AiCatalogPart): number | null {
  const fromName = part.name.match(/(\d{2,3})\s*W\b/i);
  const named = fromName ? Number(fromName[1]) : null;
  const rated = part.tdpWatts && part.tdpWatts > 0 ? part.tdpWatts : null;
  if (named && rated) return Math.min(named, rated);
  return named ?? rated;
}

function ramSpeedMhz(name: string): number {
  const hit = name.match(/\b(1[6-9]\d{2}|[2-7]\d{3})\b/);
  return hit ? Number(hit[1]) : 0;
}

function fitness(filled: Filled, useCase: AiUseCase, partsBudget: number): number {
  const cpu = filled.sel.CPU;
  const gpu = filled.sel.GPU && !isNonePart(filled.sel.GPU) ? filled.sel.GPU : null;
  const ram = filled.sel.RAM;
  const ssd = getSsds(filled.sel)[0];
  if (!cpu || !ram || !ssd) return -1;
  const cpuR = chipRel(cpu.name, "cpu");
  const gpuR = gpu ? chipRel(gpu.name, "gpu") : cpuHasIntegratedGraphics(cpu) ? 18 : 0;
  const mem = ramGbFor(ram.name, filled.ramQty);
  const disk = storageGb(ssd.name);
  const kit = parseRamKitLayout(ram.name);
  let perf = 0;
  if (useCase === "gaming") perf = gpuR * 1.35 + cpuR * 0.9 + Math.min(mem, 32) * 0.8;
  else if (useCase === "streaming") perf = gpuR * 1.05 + cpuR * 1.1 + Math.min(mem, 32);
  else if (useCase === "content") perf = cpuR * 1.15 + gpuR * 0.9 + Math.min(mem, 64) * 1.1 + Math.min(disk, 2000) * 0.01;
  else if (useCase === "work") perf = cpuR * 1.4 + Math.min(mem, 64) * 1.3 + Math.min(disk, 2000) * 0.02 + gpuR * 0.35;
  else perf = cpuR * 0.8 + (cpuHasIntegratedGraphics(cpu) ? 40 : 0) + Math.min(mem, 32) + Math.min(disk, 1000) * 0.02;
  if (gpu && cpuR < gpuR * 0.8) perf -= gpuR * 0.8 - cpuR;
  if (kit && kit.perModuleGb < 8) perf -= 45;
  if (disk < WEIGHTS[useCase].ssdGb) perf -= 18;
  const psu = filled.sel.PSU;
  if (gpu && psu?.wattage && psu.wattage < 550) perf -= 25;
  const util = filled.cost / partsBudget;
  const utilScore = util >= 0.72 ? util * 90 : util * 30;
  return perf + utilScore;
}

function toLine(part: CompatPart, qty: number): AiBuildLine {
  return {
    id: part.id,
    category: part.category,
    brand: part.brand ?? "",
    name: part.name,
    priceMkd: part.priceMkd ?? 0,
    qty,
    imageUrl: (part as AiCatalogPart).imageUrl ?? null,
    socket: part.socket ?? null,
    ramType: part.ramType ?? null,
    wattage: part.wattage ?? null,
    tdpWatts: part.tdpWatts ?? null,
    formFactor: part.formFactor ?? null,
    includesCooler: Boolean(part.includesCooler),
  };
}

function qualityOk(filled: Filled, useCase: AiUseCase, relaxed: boolean): boolean {
  const ram = filled.sel.RAM;
  const ssd = getSsds(filled.sel)[0];
  const gpu = filled.sel.GPU && !isNonePart(filled.sel.GPU) ? filled.sel.GPU : null;
  const psu = filled.sel.PSU;
  if (!ram || !ssd || !psu) return false;
  const mem = ramGbFor(ram.name, filled.ramQty);
  const disk = storageGb(ssd.name);
  const memNeed = relaxed ? Math.min(16, WEIGHTS[useCase].ramGb) : WEIGHTS[useCase].ramGb;
  const diskNeed = relaxed ? Math.min(512, WEIGHTS[useCase].ssdGb) : WEIGHTS[useCase].ssdGb;
  if (mem < memNeed || disk < diskNeed) return false;
  if ((psu.wattage ?? 0) < (gpu ? 550 : 450)) return false;
  return true;
}

function focusFor(useCase: AiUseCase, hasGpu: boolean): AiBuildFocus {
  if (!hasGpu) return "integrated";
  if (useCase === "gaming") return "gpu";
  if (useCase === "streaming" || useCase === "content") return "balanced";
  return "cpu";
}

export function isAiUseCase(value: string): value is AiUseCase {
  return (AI_USE_CASES as readonly string[]).includes(value);
}

/** Pick an in-stock, compatible PC for a budget and use. */
export function buildAiPc(
  parts: AiCatalogPart[],
  input: { useCase: AiUseCase; budgetMkd: number; assemblyFeeMkd: number },
): AiBuild | null {
  const partsBudget = input.budgetMkd - input.assemblyFeeMkd;
  if (partsBudget < 12000) return null;

  const weights = WEIGHTS[input.useCase];
  const catalog = parts.filter((part) => !isNonePart(part));
  const cpus = catalog.filter((part) => part.category === "CPU" && buyable(part));
  const gpus = catalog.filter((part) => part.category === "GPU" && buyable(part));

  const candidates: Filled[] = [];
  const consider = (cpu: AiCatalogPart, gpu: AiCatalogPart | null, relaxedQuality: boolean) => {
    const filled = completeBuild(catalog, input.useCase, partsBudget, cpu, gpu);
    if (filled && qualityOk(filled, input.useCase, relaxedQuality)) candidates.push(filled);
  };

  const runPairs = (relaxedQuality: boolean) => {
    if (!weights.wantGpu) {
      const officeCpus = spreadPicks(
        cpus.filter((cpu) => cpuHasIntegratedGraphics(cpu)),
        (cpu) => chipRel(cpu.name, "cpu") + (cpu.includesCooler ? 12 : 0),
        Math.round(partsBudget * 0.12),
        Math.round(partsBudget * 0.34),
        8,
      );
      for (const cpu of officeCpus) consider(cpu, null, relaxedQuality);
      return;
    }

    const gpuMax = Math.round(partsBudget * 0.48);
    const gpuMin = Math.round(partsBudget * 0.18);
    const cpuMax = Math.round(partsBudget * 0.32);
    const cpuMin = Math.round(partsBudget * 0.1);
    const gpuPicks = spreadPicks(gpus, (gpu) => chipRel(gpu.name, "gpu"), gpuMin, gpuMax, 6);
    const cpuPicks = spreadPicks(cpus, (cpu) => chipRel(cpu.name, "cpu"), cpuMin, cpuMax, 6);
    for (const relaxed of [false, true]) {
      if (candidates.length) break;
      for (const gpu of gpuPicks) {
        for (const cpu of cpuPicks) {
          if (priceOf(cpu) + priceOf(gpu) > partsBudget * 0.7) continue;
          if (!pairOk(cpu, gpu, input.useCase, relaxed)) continue;
          consider(cpu, gpu, relaxedQuality);
        }
      }
    }
    if (input.useCase === "work" || input.useCase === "content") {
      const igpu = spreadPicks(
        cpus.filter((cpu) => cpuHasIntegratedGraphics(cpu)),
        (cpu) => chipRel(cpu.name, "cpu"),
        cpuMin,
        Math.round(partsBudget * 0.36),
        4,
      );
      for (const cpu of igpu) consider(cpu, null, relaxedQuality);
    }
  };

  runPairs(false);
  if (!candidates.length) runPairs(true);

  if (!candidates.length) return null;
  candidates.sort((a, b) => fitness(b, input.useCase, partsBudget) - fitness(a, input.useCase, partsBudget));
  const best = candidates[0];
  const gpu = best.sel.GPU && !isNonePart(best.sel.GPU) ? best.sel.GPU : null;
  const ram = best.sel.RAM;
  const ssd = getSsds(best.sel)[0];
  const cpu = best.sel.CPU;
  if (!cpu || !ram || !ssd || !best.sel.MOTHERBOARD || !best.sel.PSU || !best.sel.CASE) return null;

  const lines: AiBuildLine[] = [
    toLine(cpu, 1),
    ...(best.sel.COOLER && !isNonePart(best.sel.COOLER) ? [toLine(best.sel.COOLER, 1)] : []),
    toLine(best.sel.MOTHERBOARD, 1),
    toLine(ram, best.ramQty),
    ...(gpu ? [toLine(gpu, 1)] : []),
    toLine(best.sel.PSU, 1),
    toLine(best.sel.CASE, 1),
    toLine(ssd, 1),
  ];

  return {
    useCase: input.useCase,
    focus: focusFor(input.useCase, Boolean(gpu)),
    budgetMkd: input.budgetMkd,
    assemblyFeeMkd: input.assemblyFeeMkd,
    partsCostMkd: best.cost,
    totalMkd: best.cost + input.assemblyFeeMkd,
    ramGb: ramGbFor(ram.name, best.ramQty),
    storageGb: storageGb(ssd.name),
    cpuName: `${cpu.brand ?? ""} ${cpu.name}`.trim(),
    gpuName: gpu ? `${gpu.brand ?? ""} ${gpu.name}`.trim() : null,
    lines,
  };
}
