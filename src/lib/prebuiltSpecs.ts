import type { PrebuiltCardData } from "@/components/PrebuiltCard";

export type SpecLine = { key: string; label: string; value: string };

/** Full part list for a prebuilt — skips empty optional fields. */
export function getPrebuiltSpecs(pc: PrebuiltCardData): SpecLine[] {
  const lines: SpecLine[] = [
    ...(pc.condition === "used"
      ? [
          {
            key: "CONDITION",
            label: "Condition",
            value: pc.conditionGrade?.trim() || "Used",
          },
        ]
      : []),
    { key: "CPU", label: "CPU", value: pc.cpuLabel },
    { key: "COOLER", label: "Cooler", value: pc.coolerLabel ?? "" },
    { key: "MOTHERBOARD", label: "Motherboard", value: pc.motherboardLabel ?? "" },
    { key: "RAM", label: "RAM", value: pc.ramLabel },
    { key: "GPU", label: "GPU", value: pc.gpuLabel },
    { key: "SSD", label: "SSD", value: pc.ssdLabel },
    { key: "PSU", label: "PSU", value: pc.psuLabel ?? "" },
    { key: "CASE", label: "Case", value: pc.caseLabel ?? "" },
  ];
  return lines.filter((l) => Boolean(l.value.trim()));
}
