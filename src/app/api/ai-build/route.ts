import { NextResponse } from "next/server";
import { z } from "zod";
import { ASSEMBLY_FEE_DEFAULT } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { aiMinimumBudgets, buildAiPc, type AiCatalogPart } from "@/lib/aiBuild";
import { catalogWarrantyMonths } from "@/lib/partWarranty";

const bodySchema = z.object({
  budgetMkd: z.number().int().positive(),
  useCase: z.enum(["gaming", "work", "office", "content", "streaming"]),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());

    const [items, settings] = await Promise.all([
      prisma.part.findMany({ where: { active: true } }),
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
    ]);
    const assemblyFeeMkd = settings?.assemblyFeeMkd ?? ASSEMBLY_FEE_DEFAULT;
    const minBudgetMkd = aiMinimumBudgets(items as AiCatalogPart[], assemblyFeeMkd)[body.useCase];
    if (body.budgetMkd < minBudgetMkd) {
      return NextResponse.json({ error: "budget_low", minBudgetMkd }, { status: 400 });
    }

    const build = buildAiPc(items, {
      useCase: body.useCase,
      budgetMkd: body.budgetMkd,
      assemblyFeeMkd,
    });
    if (!build) {
      return NextResponse.json({ error: "no_build", minBudgetMkd }, { status: 400 });
    }
    return NextResponse.json({
      build: {
        ...build,
        lines: build.lines.map((line) => ({
          ...line,
          warrantyMonths: catalogWarrantyMonths(line),
        })),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    console.error("[ai-build POST]", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
