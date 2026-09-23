import { NextResponse } from "next/server";
import { z } from "zod";
import { ASSEMBLY_FEE_DEFAULT } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { AI_MIN_BUDGET_MKD, buildAiPc } from "@/lib/aiBuild";

const bodySchema = z.object({
  budgetMkd: z.number().int().positive(),
  useCase: z.enum(["gaming", "work", "office", "content", "streaming"]),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    if (body.budgetMkd < AI_MIN_BUDGET_MKD) {
      return NextResponse.json(
        { error: "budget_low", minBudgetMkd: AI_MIN_BUDGET_MKD },
        { status: 400 },
      );
    }

    const [items, settings] = await Promise.all([
      prisma.part.findMany({ where: { active: true } }),
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
    ]);
    const assemblyFeeMkd = settings?.assemblyFeeMkd ?? ASSEMBLY_FEE_DEFAULT;
    const build = buildAiPc(items, {
      useCase: body.useCase,
      budgetMkd: body.budgetMkd,
      assemblyFeeMkd,
    });
    if (!build) {
      return NextResponse.json({ error: "no_build", minBudgetMkd: AI_MIN_BUDGET_MKD }, { status: 400 });
    }
    return NextResponse.json({ build });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    console.error("[ai-build POST]", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
