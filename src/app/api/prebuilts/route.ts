import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const condition = searchParams.get("condition"); // "new" | "used" | null=all active

  const items = await prisma.prebuilt.findMany({
    where: {
      active: true,
      ...(condition === "used" || condition === "new" ? { condition } : {}),
    },
    orderBy: { priceMkd: "asc" },
  });
  return NextResponse.json({ items });
}
