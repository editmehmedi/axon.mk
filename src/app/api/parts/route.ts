import { NextResponse } from "next/server";
import { ASSEMBLY_FEE_DEFAULT } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { catalogWarrantyMonths } from "@/lib/partWarranty";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const items = await prisma.part.findMany({
      where: {
        active: true,
        ...(category ? { category: category as never } : {}),
      },
      orderBy: [{ category: "asc" }, { priceMkd: "asc" }],
    });
    const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    return NextResponse.json({
      items: items.map((part) => ({
        ...part,
        warrantyMonths: catalogWarrantyMonths(part),
      })),
      assemblyFeeMkd: settings?.assemblyFeeMkd ?? ASSEMBLY_FEE_DEFAULT,
    });
  } catch (e) {
    console.error("[parts GET]", e);
    return NextResponse.json(
      { items: [], assemblyFeeMkd: ASSEMBLY_FEE_DEFAULT, error: "Failed to load parts" },
      { status: 500 },
    );
  }
}
