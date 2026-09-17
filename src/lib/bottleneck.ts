import { identifyCpu, identifyGpu, type IdentifiedChip } from "@/lib/chipCatalog";

export type BottleneckResolution = "1080" | "1440" | "2160";
export type BottleneckSide = "cpu" | "gpu" | "balanced";
export type BottleneckSeverity = "none" | "mild" | "moderate" | "severe";

export type BottleneckResult = {
  side: BottleneckSide;
  /** 0–100 how much the weaker part holds the stronger one back */
  percent: number;
  cpuScore: number;
  gpuScore: number;
  cpuUtil: number;
  gpuUtil: number;
  /** 0 = fully CPU-bound, 50 = even, 100 = fully GPU-bound */
  balance: number;
  severity: BottleneckSeverity;
  resolution: BottleneckResolution;
  cpu: IdentifiedChip;
  gpu: IdentifiedChip;
};

const RES_FACTOR: Record<BottleneckResolution, { cpu: number; gpu: number }> = {
  // Higher res: GPU frame time rises a lot, CPU barely changes.
  "1080": { cpu: 1, gpu: 1 },
  "1440": { cpu: 0.97, gpu: 0.65 },
  "2160": { cpu: 0.93, gpu: 0.36 },
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function severityFor(percent: number): BottleneckSeverity {
  if (percent >= 40) return "severe";
  if (percent >= 20) return "moderate";
  if (percent >= 10) return "mild";
  return "none";
}

/**
 * Compare CPU vs GPU as competing frame throughputs at a resolution.
 * The slower side sits at 100% load; the faster side has leftover headroom.
 */
export function estimateBottleneck(opts: {
  cpuName?: string | null;
  gpuName?: string | null;
  resolution?: BottleneckResolution;
}): BottleneckResult | null {
  if (!opts.cpuName?.trim() || !opts.gpuName?.trim()) return null;

  const resolution = opts.resolution ?? "1080";
  const cpu = identifyCpu(opts.cpuName);
  const gpu = identifyGpu(opts.gpuName);
  const factor = RES_FACTOR[resolution];

  const cpuThru = cpu.rel * factor.cpu;
  const gpuThru = gpu.rel * factor.gpu;
  const cpuLimited = cpuThru < gpuThru;
  const even = Math.abs(cpuThru - gpuThru) < 0.5;

  const weaker = Math.min(cpuThru, gpuThru);
  const stronger = Math.max(cpuThru, gpuThru);
  const rawPercent = stronger <= 0 ? 0 : Math.round((1 - weaker / stronger) * 100);
  const percent = clamp(rawPercent, 0, 99);

  const cpuUtil = even ? 100 : cpuLimited ? 100 : clamp(Math.round((gpuThru / cpuThru) * 100), 1, 100);
  const gpuUtil = even ? 100 : cpuLimited ? clamp(Math.round((cpuThru / gpuThru) * 100), 1, 100) : 100;

  const severity = severityFor(percent);
  const side: BottleneckSide = severity === "none" ? "balanced" : cpuLimited ? "cpu" : "gpu";
  const balance = clamp(Math.round(50 + (cpuLimited ? -percent / 2 : percent / 2)), 4, 96);

  return {
    side,
    percent,
    cpuScore: clamp(Math.round(cpu.rel * 0.58), 8, 100),
    gpuScore: clamp(Math.round(gpu.rel * 0.4), 4, 100),
    cpuUtil,
    gpuUtil,
    balance,
    severity,
    resolution,
    cpu,
    gpu,
  };
}

export const BOTTLENECK_RESOLUTIONS: BottleneckResolution[] = ["1080", "1440", "2160"];
