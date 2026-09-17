/** Rough gaming FPS estimates (illustrative, not lab benchmarks). */

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
  /** Relative demand 0.55 (esports) → 1.35 (ultra AAA) */
  demand: number;
  /** How CPU-bound the title is (0 = GPU heavy, 1 = CPU heavy). */
  cpuBound: number;
};

export type FpsQuality = "low" | "medium" | "high";

export type FpsEstimate = {
  gameId: FpsGameId;
  nameKey: string;
  fps1080: number;
  fps1440: number;
  label: "esports" | "high" | "medium" | "playable" | "low";
};

export const FPS_QUALITY_FACTOR: Record<FpsQuality, number> = {
  low: 1.55,
  medium: 1.25,
  high: 1,
};

export const FPS_GAMES: FpsGame[] = [
  { id: "valorant", nameKey: "builder.fps.game.valorant", demand: 0.52, cpuBound: 0.85 },
  { id: "cs2", nameKey: "builder.fps.game.cs2", demand: 0.58, cpuBound: 0.8 },
  { id: "lol", nameKey: "builder.fps.game.lol", demand: 0.5, cpuBound: 0.75 },
  { id: "fortnite", nameKey: "builder.fps.game.fortnite", demand: 0.72, cpuBound: 0.55 },
  { id: "minecraft", nameKey: "builder.fps.game.minecraft", demand: 0.55, cpuBound: 0.7 },
  { id: "eafc", nameKey: "builder.fps.game.eafc", demand: 0.68, cpuBound: 0.45 },
  { id: "gta5", nameKey: "builder.fps.game.gta5", demand: 0.78, cpuBound: 0.5 },
  { id: "warzone", nameKey: "builder.fps.game.warzone", demand: 1.05, cpuBound: 0.55 },
  { id: "cyberpunk", nameKey: "builder.fps.game.cyberpunk", demand: 1.28, cpuBound: 0.3 },
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Higher = stronger GPU (0–100). Mapped from the shared chip catalog. */
export function gpuScore(gpuName: string): number {
  return clamp(Math.round(identifyGpu(gpuName).rel * 0.4), 4, 100);
}

/** Higher = stronger CPU for gaming (0–100), same scale as GPU. */
export function cpuScore(cpuName: string): number {
  if (!cpuName.trim()) return 40;
  return clamp(Math.round(identifyCpu(cpuName).rel * 0.58), 8, 100);
}

/**
 * Effective gaming power: weak CPU caps a strong GPU (and vice versa),
 * weighted by how CPU-bound the title is.
 */
function effectivePower(cpu: number, gpu: number, cpuBound: number): number {
  const gpuLed = Math.min(gpu, cpu + 12);
  const cpuLed = Math.min(cpu, gpu + 8);
  return gpuLed * (1 - cpuBound) + cpuLed * cpuBound;
}

function fpsLabel(fps: number): FpsEstimate["label"] {
  if (fps >= 200) return "esports";
  if (fps >= 120) return "high";
  if (fps >= 75) return "medium";
  if (fps >= 50) return "playable";
  return "low";
}

function clampFps(n: number): number {
  return Math.max(25, Math.min(400, Math.round(n / 5) * 5));
}

/**
 * Estimate average FPS for sample games at Low / Medium / High settings.
 * Returns null until a GPU is selected.
 */
export function estimateBuildFps(opts: {
  gpuName?: string | null;
  cpuName?: string | null;
  quality?: FpsQuality;
}): FpsEstimate[] | null {
  if (!opts.gpuName?.trim()) return null;

  const quality = opts.quality ?? "high";
  const qualityMul = FPS_QUALITY_FACTOR[quality];
  const g = gpuScore(opts.gpuName);
  const c = opts.cpuName?.trim() ? cpuScore(opts.cpuName) : Math.min(g, 55);

  return FPS_GAMES.map((game) => {
    const power = effectivePower(c, g, game.cpuBound);
    const base1080 = power * 2.15 * qualityMul;
    const fps1080 = clampFps(base1080 / game.demand);
    const fps1440 = clampFps(fps1080 * 0.68);
    return {
      gameId: game.id,
      nameKey: game.nameKey,
      fps1080,
      fps1440,
      label: fpsLabel(fps1080),
    };
  });
}
