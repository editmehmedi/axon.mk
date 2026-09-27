import type { PrebuiltCardData } from "@/components/PrebuiltCard";

export type SpecLine = { key: string; label: string; value: string; used: boolean };

const USED_PREFIX = /^(?:used|половен|по|po|користен|i përdorur)\b\s*[·•:-]?\s*/i;

/** A part label saved from a used listing, e.g. "Used · RTX 4060 8GB". */
export function isUsedPartLabel(value: string): boolean {
  return USED_PREFIX.test(value.trim());
}

/** Part name without the stored "Used" prefix. */
export function displayPartValue(value: string): string {
  const trimmed = value.trim();
  if (!isUsedPartLabel(trimmed)) return trimmed;
  return trimmed.replace(USED_PREFIX, "").trim() || trimmed;
}

function specLine(key: string, label: string, value: string, pcUsed: boolean): SpecLine {
  return {
    key,
    label,
    value,
    used: key !== "CONDITION" && (pcUsed || isUsedPartLabel(value)),
  };
}

/** Full part list for a prebuilt — skips empty optional fields. */
export function getPrebuiltSpecs(pc: PrebuiltCardData): SpecLine[] {
  const pcUsed = pc.condition === "used";
  const lines: SpecLine[] = [
    ...(pcUsed
      ? [
          specLine("CONDITION", "Condition", pc.conditionGrade?.trim() || "Used", false),
        ]
      : []),
    specLine("CPU", "CPU", pc.cpuLabel, pcUsed),
    specLine("COOLER", "Cooler", pc.coolerLabel ?? "", pcUsed),
    specLine("MOTHERBOARD", "Motherboard", pc.motherboardLabel ?? "", pcUsed),
    specLine("RAM", "RAM", pc.ramLabel, pcUsed),
    specLine("GPU", "GPU", pc.gpuLabel, pcUsed),
    specLine("SSD", "SSD", pc.ssdLabel, pcUsed),
    specLine("PSU", "PSU", pc.psuLabel ?? "", pcUsed),
    specLine("CASE", "Case", pc.caseLabel ?? "", pcUsed),
  ];
  return lines.filter((l) => Boolean(l.value.trim()));
}
