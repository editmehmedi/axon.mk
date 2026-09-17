import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ trackingCode: code.toUpperCase() }, { cargoCode: code }],
    },
    include: {
      prebuilt: true,
      items: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Не е пронајдена" }, { status: 404 });
  }

  return NextResponse.json({
    order: {
      trackingCode: order.trackingCode,
      cargoCode: order.cargoCode,
      status: order.status,
      type: order.type,
      totalMkd: order.totalMkd,
      customerName: order.customerName,
      prebuilt: order.prebuilt,
      items: order.items,
      statusHistory: order.statusHistory,
      createdAt: order.createdAt,
    },
  });
}
