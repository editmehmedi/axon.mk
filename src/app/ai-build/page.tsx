import { AiBuildView } from "@/components/AiBuildView";
import { ASSEMBLY_FEE_DEFAULT } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { aiMinimumBudgets, type AiCatalogPart } from "@/lib/aiBuild";

export default async function AiBuildPage() {
  const [items, settings] = await Promise.all([
    prisma.part.findMany({ where: { active: true } }),
    prisma.siteSettings.findUnique({ where: { id: 1 } }),
  ]);
  const minimums = aiMinimumBudgets(
    items as AiCatalogPart[],
    settings?.assemblyFeeMkd ?? ASSEMBLY_FEE_DEFAULT,
  );
  return <AiBuildView minimums={minimums} />;
}
