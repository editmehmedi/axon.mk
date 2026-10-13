import {
  checkCompatibility,
  coolerCoolingWatts,
  cpuCoolerPlan,
  cpuHasIntegratedGraphics,
  getSsds,
  hasRealPsu,
  isNonePart,
  type CompatPart,
  type CompatSelection,
} from "@/lib/compatibility";
import { askGemini } from "@/lib/itChat";
import type { Locale } from "@/lib/i18n";

export type BuildVerdict = "ok" | "warning" | "error";

function real(part: CompatPart | null | undefined): CompatPart | null {
  return part && !isNonePart(part) ? part : null;
}

function partLine(part: CompatPart): string {
  const details = [
    part.socket ? `socket ${part.socket}` : "",
    part.ramType ?? "",
    part.formFactor ?? "",
    part.wattage ? `${part.wattage}W` : "",
    part.category === "COOLER" && coolerCoolingWatts(part)
      ? `cools about ${coolerCoolingWatts(part)}W`
      : part.tdpWatts
        ? `TDP ${part.tdpWatts}W`
        : "",
    part.category === "CPU" ? (part.includesCooler ? "includes a stock cooler" : "no stock cooler") : "",
  ].filter(Boolean);
  const name = [part.brand, part.name].filter(Boolean).join(" ");
  return `- ${part.category}: ${name}${details.length ? ` (${details.join(", ")})` : ""}`;
}

function selectedLines(selection: CompatSelection): string[] {
  const lines: string[] = [];
  for (const key of ["CPU", "COOLER", "MOTHERBOARD", "RAM", "GPU", "PSU", "CASE"] as const) {
    const part = real(selection[key]);
    if (part) lines.push(partLine(part));
  }
  for (const ssd of getSsds(selection)) lines.push(partLine(ssd));
  return lines;
}

function missingNotes(selection: CompatSelection): string[] {
  const cpu = real(selection.CPU);
  const notes: string[] = [];
  if (!real(selection.RAM)) notes.push("RAM is not selected.");
  if (!hasRealPsu(selection)) notes.push("A power supply is not selected.");
  if (cpu && !real(selection.GPU) && !cpuHasIntegratedGraphics(cpu)) {
    notes.push("No graphics card is selected, and this CPU has no integrated graphics.");
  }
  if (cpu && (!real(selection.COOLER) || cpuCoolerPlan(cpu).tier !== "stock")) {
    notes.push(`Cooler advice: use ${cpuCoolerPlan(cpu).recommendation}`);
  }
  if (getSsds(selection).length === 0) notes.push("Storage is not selected.");
  return notes;
}

export async function explainBuild(
  locale: Locale,
  selection: CompatSelection,
  qty: { ramQty?: number; ssdQty?: number },
): Promise<{ verdict: BuildVerdict; text: string }> {
  const issues = checkCompatibility(selection, qty);
  const verdict: BuildVerdict = issues.some((issue) => issue.severity === "error")
    ? "error"
    : issues.some((issue) => issue.severity === "warning")
      ? "warning"
      : "ok";
  const language = locale === "mk" ? "Macedonian" : locale === "sq" ? "Albanian" : "English";
  const system = [
    "You check whether a custom PC the shopper is building will fit together.",
    "The issue list is already decided. Do not add a conflict, remove one, or call an error only a suggestion.",
    "If the issue list says none, the selected parts are compatible.",
    "The same CPU and motherboard socket means they fit. A B350 board with a Ryzen 5000 CPU is compatible when both are AM4.",
    "Explain each error in plain language and say which part to change.",
    "Always include the cooler advice in one sentence. If the selected cooler is weaker than that advice, say to change it. If it meets the advice, say that cooler is suitable.",
    "A warning is a caution, not a failure.",
    "Missing parts are notes, not conflicts, unless the issue list says otherwise.",
    `Reply in ${language}. Three to six sentences. No asterisks.`,
  ].join(" ");
  const prompt = [
    "Selected parts:",
    selectedLines(selection).join("\n") || "- none",
    "",
    "Missing:",
    missingNotes(selection).join("\n") || "- nothing important is missing",
    "",
    "Issue list:",
    issues.length
      ? issues.map((issue) => `- ${issue.severity}: ${issue.message}`).join("\n")
      : "- none",
  ].join("\n");
  const text = await askGemini(system, prompt);
  return { verdict, text };
}
