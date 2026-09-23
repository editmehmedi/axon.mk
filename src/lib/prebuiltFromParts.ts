import { identifyCpu, identifyGpu } from "@/lib/chipCatalog";
import {
  checkCompatibility,
  clampRamQty,
  cpuHasIntegratedGraphics,
  cpuNeedsCooler,
  filterCompatibleParts,
  hasBlockingErrors,
  isStockCoolerPart,
  parseRamKitLayout,
  ramKitModuleCount,
  ramQtySlotLimit,
  selectionPriceMkd,
  socketsNamedOnCooler,
  type CompatPart,
  type CompatSelection,
} from "@/lib/compatibility";

export const PREBUILT_MARKUP = 1.2;

type Part = CompatPart & {
  brand?: string | null;
  priceMkd: number;
  stock: number;
  imageUrl?: string | null;
};

export type PrebuiltAssembly = {
  cpuLabel: string;
  coolerLabel: string;
  motherboardLabel: string;
  ramLabel: string;
  gpuLabel: string;
  ssdLabel: string;
  psuLabel: string;
  caseLabel: string;
  imageUrl: string | null;
  partsCostMkd: number;
  priceMkd: number;
};

function partLabel(part: { brand?: string | null; name: string }): string {
  return `${part.brand ?? ""} ${part.name}`.replace(/\s+/g, " ").trim();
}

function sellable(part: Part): boolean {
  return (part.stock ?? 0) > 0 && (part.priceMkd ?? 0) > 0 && !isStockCoolerPart(part);
}

function storageGb(name: string): number {
  const tb = name.match(/(\d+(?:[.,]\d+)?)\s*TB\b/i);
  if (tb) return Math.round(Number(tb[1].replace(",", ".")) * 1000);
  const gb = name.match(/(\d+)\s*GB\b/i);
  return gb ? Number(gb[1]) : 0;
}

function coolerCapacity(part: Part): number | null {
  const fromName = part.name.match(/(\d{2,3})\s*W\b/i);
  const named = fromName ? Number(fromName[1]) : null;
  const rated = part.tdpWatts && part.tdpWatts > 0 ? part.tdpWatts : null;
  if (named && rated) return Math.min(named, rated);
  return named ?? rated;
}

function coolerNameFits(name: string, socket?: string | null): boolean {
  if (!socket) return true;
  const mentioned = socketsNamedOnCooler(name);
  if (!mentioned.length) return true;
  return mentioned.includes(socket.toUpperCase());
}

/** Spec line that matches the parts actually in the ready PC. */
export function describeReadyPc(pc: {
  cpuLabel: string;
  gpuLabel: string;
  ramLabel: string;
  ssdLabel: string;
}): string {
  const cpu = pc.cpuLabel.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const gpu = /integrated/i.test(pc.gpuLabel) ? "integrated graphics" : pc.gpuLabel.trim();
  return `Ready PC with ${cpu}, ${gpu}, ${pc.ramLabel.trim()} and ${pc.ssdLabel.trim()}. Built and tested, with warranty. Cash on delivery in North Macedonia.`;
}

function ramSpeedMhz(name: string): number {
  const hit = name.match(/\b(2[4-9]\d{2}|[3-7]\d{3})\b/);
  return hit ? Number(hit[1]) : 0;
}

function cheapest<T extends { priceMkd: number }>(items: T[]): T | null {
  if (!items.length) return null;
  return items.slice().sort((a, b) => a.priceMkd - b.priceMkd)[0];
}

function assemble(
  catalog: Part[],
  cpu: Part,
  gpu: Part | null,
  target: { ramGb: number; ssdGb: number; caseTier: number },
): PrebuiltAssembly | null {
  const pool = catalog.filter(sellable);
  const sel: CompatSelection = { CPU: cpu };
  if (gpu) sel.GPU = gpu;

  if (!cpuNeedsCooler(cpu)) {
    const stock = catalog.find((part) => part.category === "COOLER" && isStockCoolerPart(part));
    if (stock) sel.COOLER = stock;
  } else {
    const name = cpu.name.toLowerCase();
    let tdp = cpu.tdpWatts && cpu.tdpWatts > 0 ? cpu.tdpWatts : 65;
    if (/i9-|ryzen 9/.test(name)) tdp = Math.max(tdp, 200);
    else if (/x3d/.test(name)) tdp = Math.max(tdp, 120);
    else if (/i7-|ryzen 7/.test(name)) tdp = Math.max(tdp, 140);
    const coolers = filterCompatibleParts(pool, "COOLER", sel).filter((part) => {
      if (!coolerNameFits(part.name, cpu.socket)) return false;
      if (tdp >= 90 && /alpine|low-profile|\blp\b/i.test(part.name)) return false;
      const capacity = coolerCapacity(part);
      if (capacity != null && capacity < tdp) return false;
      if (tdp >= 105 && capacity == null) return false;
      return true;
    });
    const cooler = cheapest(coolers);
    if (!cooler) return null;
    sel.COOLER = cooler;
  }

  let boards = filterCompatibleParts(pool, "MOTHERBOARD", sel);
  if (cpu.socket) {
    const matched = boards.filter((part) => part.socket === cpu.socket);
    if (matched.length) boards = matched;
  }
  const boardTarget = Math.max(4500, Math.round((gpu?.priceMkd ?? 8000) * 0.22));
  const board =
    boards.slice().sort((a, b) => Math.abs(a.priceMkd - boardTarget) - Math.abs(b.priceMkd - boardTarget))[0] ??
    null;
  if (!board) return null;
  sel.MOTHERBOARD = board;

  const ram = chooseRam(pool, sel, target.ramGb);
  if (!ram) return null;
  sel.RAM = ram.part;

  const ssd = chooseSsd(pool, sel, target.ssdGb);
  if (!ssd) return null;
  sel.SSD = [ssd];

  const gpuDraw = gpu ? (gpu.tdpWatts && gpu.tdpWatts > 0 ? gpu.tdpWatts : 160) : 0;
  const wattFloor = gpu ? Math.max(550, Math.ceil(gpuDraw * 2 + 200)) : 450;
  const psus = filterCompatibleParts(pool, "PSU", sel).filter((part) => (part.wattage ?? 0) >= wattFloor);
  const psu = cheapest(psus);
  if (!psu) return null;
  sel.PSU = psu;

  const cases = filterCompatibleParts(pool, "CASE", sel).slice().sort((a, b) => a.priceMkd - b.priceMkd);
  if (!cases.length) return null;
  const caseCap = Math.max(0, Math.floor((cases.length - 1) * 0.45));
  const caseIndex = Math.min(caseCap, Math.max(0, target.caseTier));
  const pcCase = cases[caseIndex];
  sel.CASE = pcCase;

  if (hasBlockingErrors(checkCompatibility(sel, { ramQty: ram.qty, ssdQty: 1 }))) return null;
  const partsCostMkd = selectionPriceMkd(sel, ram.qty, 1);
  if (partsCostMkd <= 0) return null;

  const cooler = sel.COOLER;
  return {
    cpuLabel: partLabel(cpu),
    coolerLabel: cooler && isStockCoolerPart(cooler) ? "Included with CPU" : cooler ? partLabel(cooler) : "Included with CPU",
    motherboardLabel: partLabel(board),
    ramLabel: ram.qty > 1 ? `${partLabel(ram.part)} ×${ram.qty}` : partLabel(ram.part),
    gpuLabel: gpu ? partLabel(gpu) : "Integrated graphics",
    ssdLabel: partLabel(ssd),
    psuLabel: partLabel(psu),
    caseLabel: partLabel(pcCase),
    imageUrl: pcCase.imageUrl ?? null,
    partsCostMkd,
    priceMkd: Math.round(partsCostMkd * PREBUILT_MARKUP),
  };
}

function chooseRam(
  pool: Part[],
  sel: CompatSelection,
  targetGb: number,
): { part: Part; qty: number } | null {
  const rams = filterCompatibleParts(pool, "RAM", sel);
  const options: { part: Part; qty: number; gb: number; cost: number; sticks: number }[] = [];
  for (const part of rams) {
    const kit = parseRamKitLayout(part.name);
    if (!kit || kit.perModuleGb < 8) continue;
    const maxQty = clampRamQty(4, part.stock, ramQtySlotLimit(sel.MOTHERBOARD, part));
    for (let qty = 1; qty <= maxQty; qty++) {
      const gb = kit.modules * kit.perModuleGb * qty;
      if (gb < targetGb || gb > targetGb * 2) continue;
      options.push({
        part,
        qty,
        gb,
        cost: part.priceMkd * qty,
        sticks: ramKitModuleCount(part.name) * qty,
      });
    }
  }
  const ranked = options.sort((a, b) => {
    const aFast = ramSpeedMhz(a.part.name) >= 3200 ? 1 : 0;
    const bFast = ramSpeedMhz(b.part.name) >= 3200 ? 1 : 0;
    if (aFast !== bFast) return bFast - aFast;
    if (a.sticks === 2 && b.sticks !== 2) return -1;
    if (b.sticks === 2 && a.sticks !== 2) return 1;
    return a.cost - b.cost;
  });
  const pick = ranked[0];
  if (pick) return pick;
  if (targetGb > 16) return chooseRam(pool, sel, 16);
  return null;
}

function chooseSsd(pool: Part[], sel: CompatSelection, targetGb: number): Part | null {
  const ssds = filterCompatibleParts(pool, "SSD", sel).filter((part) => storageGb(part.name) >= targetGb);
  const nvme = ssds.filter((part) => /nvme/i.test(part.name));
  return cheapest(nvme.length ? nvme : ssds) ?? (targetGb > 512 ? chooseSsd(pool, sel, 512) : null);
}

function chooseCpu(cpus: Part[], gpu: Part): Part | null {
  const gpuRel = identifyGpu(gpu.name).rel;
  const floor = gpuRel * 0.8;
  const target = Math.round(gpu.priceMkd * 0.48);
  const cap = Math.round(Math.max(gpu.priceMkd * 0.85, target));
  const scored = cpus.map((cpu) => ({ cpu, rel: identifyCpu(cpu.name).rel }));
  let ranked = scored.filter((row) => row.rel >= floor && row.cpu.priceMkd <= cap);
  if (!ranked.length) ranked = scored.filter((row) => row.rel >= floor);
  if (!ranked.length) ranked = scored.filter((row) => row.rel >= floor * 0.85);
  ranked.sort(
    (a, b) => Math.abs(a.cpu.priceMkd - target) - Math.abs(b.cpu.priceMkd - target) || b.rel - a.rel,
  );
  return ranked[0]?.cpu ?? null;
}

function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const picked: T[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i * (items.length - 1)) / Math.max(1, count - 1));
    if (seen.has(idx)) continue;
    seen.add(idx);
    picked.push(items[idx]);
  }
  return picked;
}

/** Ready PCs built only from in-stock builder parts, priced 20% above the parts. */
export function buildPrebuiltLineup(parts: Part[], count = 20): PrebuiltAssembly[] {
  const catalog = parts.filter((part) => part.category);
  const cpus = catalog.filter((part) => part.category === "CPU" && sellable(part));
  const gpus = catalog.filter((part) => part.category === "GPU" && sellable(part));

  const office: PrebuiltAssembly[] = [];
  const officeCpus = cpus
    .filter((cpu) => cpuHasIntegratedGraphics(cpu) && !/pentium|celeron/i.test(cpu.name))
    .sort((a, b) => a.priceMkd - b.priceMkd || identifyCpu(b.name).rel - identifyCpu(a.name).rel);
  for (const cpu of officeCpus) {
    if (office.length >= 2) break;
    const built = assemble(catalog, cpu, null, {
      ramGb: 16,
      ssdGb: office.length === 0 ? 512 : 1000,
      caseTier: office.length,
    });
    if (!built) continue;
    if (office.some((pc) => pc.cpuLabel === built.cpuLabel)) continue;
    office.push(built);
  }

  const byChip = new Map<string, Part>();
  for (const gpu of gpus.slice().sort((a, b) => a.priceMkd - b.priceMkd)) {
    const chip = identifyGpu(gpu.name);
    if (chip.confidence === "fallback") continue;
    if (!byChip.has(chip.id)) byChip.set(chip.id, gpu);
  }
  const gpuLadder = [...byChip.values()]
    .filter((gpu) => identifyGpu(gpu.name).rel >= 50)
    .sort((a, b) => identifyGpu(a.name).rel - identifyGpu(b.name).rel || a.priceMkd - b.priceMkd);

  const gaming: PrebuiltAssembly[] = [];
  gpuLadder.forEach((gpu, index) => {
    const cpu = chooseCpu(cpus, gpu);
    if (!cpu) return;
    const rel = identifyGpu(gpu.name).rel;
    const built = assemble(catalog, cpu, gpu, {
      ramGb: rel >= 170 ? 64 : rel >= 105 ? 32 : 16,
      ssdGb: rel >= 160 ? 2000 : 1000,
      caseTier: index,
    });
    if (!built) return;
    if (gaming.some((pc) => pc.gpuLabel === built.gpuLabel)) return;
    gaming.push(built);
  });
  gaming.sort((a, b) => a.partsCostMkd - b.partsCostMkd);

  const slots = Math.max(0, count - office.length);
  return [...office, ...spread(gaming, slots)].slice(0, count);
}
