/** Rough gaming FPS from catalog chips. Illustrative, not lab benchmarks. */

import { identifyCpu, identifyGpu } from "@/lib/chipCatalog";

export type FpsGameId =
  | "fortnite"
  | "valorant"
  | "cs2"
  | "warzone"
  | "gta5"
  | "cyberpunk"
  | "lol"
  | "minecraft"
  | "eafc";

export type FpsGame = {
  id: FpsGameId;
  /** i18n key under builder.fps.game.* */
  nameKey: string;
  /** 1080p Low CPU-limit FPS for a Ryzen 7 7800X3D (CS2 ceiling 600). */
  cpuAt600: number;
  /** 1 tracks that CPU's CS2 result. Lower shrinks the gap in GPU-heavy games. */
  cpuSpread: number;
  /** 1080p High FPS at GPU rel 100 (RTX 4060) when the CPU is not limiting. */
  gpuAt100: number;
  /** <1 = diminishing returns once the GPU is already fast enough. */
  gpuScale: number;
  /** 1440p GPU FPS as a fraction of 1080p. */
  at1440: number;
};

export type FpsQuality = "low" | "medium" | "high";

export type FpsEstimate = {
  gameId: FpsGameId;
  nameKey: string;
  fps1080: number;
  fps1440: number;
  label: "esports" | "high" | "medium" | "playable" | "low";
};

/**
 * 1080p Low CPU ceiling in CS2 with a GPU that is not the limit.
 * Tuned per chip: X3D parts pull ahead of a similar non-X3D, and older
 * quad-cores stay well below a Ryzen 5 5600.
 */
const CS2_LOW: Record<string, number> = {
  "r9-9950x3d": 740,
  "r9-9950x": 500,
  "r9-9900x": 480,
  "r7-9850x3d": 800,
  "r7-9800x3d": 770,
  "r7-9700x": 470,
  "r5-9600x": 450,
  "r9-7950x3d": 580,
  "r9-7950x": 430,
  "r9-7900x": 420,
  "r7-7800x3d": 600,
  "r7-7700x": 410,
  "r7-7700": 400,
  "r5-7600x": 390,
  "r5-7600": 370,
  "r5-7500x3d": 520,
  "r5-7500f": 360,
  "r7-8700f": 390,
  "r7-8700g": 330,
  "r5-8600g": 300,
  "r5-8500g": 250,
  "r5-8400f": 350,
  "r7-5800x3d": 520,
  "r7-5700x3d": 460,
  "r7-5800x": 330,
  "r7-5700x": 310,
  "r5-5600x": 300,
  "r5-5600g": 250,
  "r5-5600": 290,
  "r5-5500": 240,
  "r5-3600x": 230,
  "r5-3600": 215,
  "r3-3400g": 130,
  "r3-3200g": 110,
  "athlon-3000g": 85,
  "i9-14900ks": 560,
  "i9-14900k": 540,
  "i7-14700k": 510,
  "i7-14700": 450,
  "i5-14600k": 490,
  "i5-14500": 370,
  "i5-14400f": 350,
  "i5-14400": 350,
  "i3-14100f": 270,
  "i3-14100": 265,
  "i9-13900k": 520,
  "i7-13700k": 480,
  "i7-13700": 420,
  "i5-13600k": 470,
  "i5-13500": 360,
  "i5-13400f": 330,
  "i5-13400": 330,
  "i3-13100": 250,
  "i9-12900k": 420,
  "i7-12700k": 390,
  "i7-12700": 350,
  "i5-12600k": 370,
  "i5-12400f": 310,
  "i5-12400": 300,
  "i3-12100f": 250,
  "i3-12100": 240,
  "i5-11400": 210,
  "i5-10400": 190,
  "i3-10100": 155,
  "u9-285k": 480,
  "u7-265k": 450,
  "u5-250kf": 410,
  "u5-245k": 400,
  "u5-235": 350,
  "u5-225f": 310,
};

/** Low is the calibrated preset. Higher settings cost the GPU more than the CPU. */
const QUALITY: Record<FpsQuality, { cpu: number; gpu: number }> = {
  low: { cpu: 1, gpu: 1.72 },
  medium: { cpu: 0.92, gpu: 1.28 },
  high: { cpu: 0.8, gpu: 1 },
};

export const FPS_GAMES: FpsGame[] = [
  { id: "valorant", nameKey: "builder.fps.game.valorant", cpuAt600: 800, cpuSpread: 0.92, gpuAt100: 560, gpuScale: 0.72, at1440: 0.8 },
  { id: "cs2", nameKey: "builder.fps.game.cs2", cpuAt600: 600, cpuSpread: 1, gpuAt100: 305, gpuScale: 1.22, at1440: 0.76 },
  { id: "lol", nameKey: "builder.fps.game.lol", cpuAt600: 860, cpuSpread: 0.8, gpuAt100: 620, gpuScale: 0.65, at1440: 0.84 },
  { id: "fortnite", nameKey: "builder.fps.game.fortnite", cpuAt600: 520, cpuSpread: 0.5, gpuAt100: 165, gpuScale: 0.9, at1440: 0.7 },
  { id: "minecraft", nameKey: "builder.fps.game.minecraft", cpuAt600: 640, cpuSpread: 0.75, gpuAt100: 420, gpuScale: 0.6, at1440: 0.78 },
  { id: "eafc", nameKey: "builder.fps.game.eafc", cpuAt600: 340, cpuSpread: 0.4, gpuAt100: 140, gpuScale: 0.92, at1440: 0.68 },
  { id: "gta5", nameKey: "builder.fps.game.gta5", cpuAt600: 300, cpuSpread: 0.45, gpuAt100: 150, gpuScale: 0.9, at1440: 0.66 },
  { id: "warzone", nameKey: "builder.fps.game.warzone", cpuAt600: 280, cpuSpread: 0.35, gpuAt100: 108, gpuScale: 0.9, at1440: 0.64 },
  { id: "cyberpunk", nameKey: "builder.fps.game.cyberpunk", cpuAt600: 240, cpuSpread: 0.22, gpuAt100: 72, gpuScale: 0.8, at1440: 0.62 },
];

function cs2LowCeiling(cpuName: string): number {
  const chip = identifyCpu(cpuName);
  const known = CS2_LOW[chip.id];
  if (known) return known;

  const rel = Math.max(chip.rel, 20) / 100;
  let fps = 290 * Math.pow(rel, 1.05);
  if (/x3d/i.test(cpuName)) fps *= 1.32;
  if (/ryzen/i.test(cpuName) && /\d{3,5}g\b/i.test(cpuName)) fps *= 0.85;
  return fps;
}

function cpuLimit(cs2Low: number, game: FpsGame, qualityCpu: number): number {
  return game.cpuAt600 * Math.pow(cs2Low / 600, game.cpuSpread) * qualityCpu;
}

function gpuLimit(gpuRel: number, game: FpsGame, qualityGpu: number): number {
  return game.gpuAt100 * Math.pow(Math.max(gpuRel, 8) / 100, game.gpuScale) * qualityGpu;
}

/** Near the lower limit. A much stronger other part barely changes the result. */
function softMin(a: number, b: number): number {
  const p = 8;
  return (a ** -p + b ** -p) ** (-1 / p);
}

function fpsLabel(fps: number): FpsEstimate["label"] {
  if (fps >= 200) return "esports";
  if (fps >= 120) return "high";
  if (fps >= 75) return "medium";
  if (fps >= 50) return "playable";
  return "low";
}

function roundFps(n: number): number {
  const step = n >= 100 ? 10 : 5;
  return Math.max(20, Math.min(1200, Math.round(n / step) * step));
}

/**
 * Average FPS at Low / Medium / High.
 * Each CPU has its own ceiling. The GPU pulls that down when it cannot keep up.
 * Returns null until a GPU is selected.
 */
export function estimateBuildFps(opts: {
  gpuName?: string | null;
  cpuName?: string | null;
  quality?: FpsQuality;
}): FpsEstimate[] | null {
  if (!opts.gpuName?.trim()) return null;

  const quality = QUALITY[opts.quality ?? "high"];
  const gpuRel = identifyGpu(opts.gpuName).rel;
  const cs2Low = opts.cpuName?.trim()
    ? cs2LowCeiling(opts.cpuName)
    : cs2LowCeiling("Ryzen 5 5600");

  return FPS_GAMES.map((game) => {
    const cpu1080 = cpuLimit(cs2Low, game, quality.cpu);
    const gpu1080 = gpuLimit(gpuRel, game, quality.gpu);
    const fps1080 = roundFps(softMin(cpu1080, gpu1080));
    const fps1440 = roundFps(softMin(cpu1080 * 0.96, gpu1080 * game.at1440));
    return {
      gameId: game.id,
      nameKey: game.nameKey,
      fps1080,
      fps1440,
      label: fpsLabel(fps1080),
    };
  });
}
