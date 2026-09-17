import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
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
    items,
    assemblyFeeMkd: settings?.assemblyFeeMkd ?? 2999,
  });
}
