import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, requireHeadAdmin } from "@/lib/auth";
import { generateCargoCode, ORDER_STATUSES } from "@/lib/constants";

const statusSchema = z.object({
  orderId: z.string(),
  status: z.enum([
    "VERIFICATION",
    "PARTS_SOURCED",
    "BUILDING",
    "HANDED_TO_CARGO",
    "DELIVERED_PAID",
  ]),
  note: z.string().optional(),
  markVerified: z.boolean().optional(),
  generateCargo: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const data = statusSchema.parse(await req.json());

    const order = await prisma.order.findUnique({ where: { id: data.orderId } });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const cargoCode =
      data.generateCargo || data.status === "HANDED_TO_CARGO"
        ? order.cargoCode || generateCargoCode()
        : order.cargoCode;

    const updated = await prisma.order.update({
      where: { id: data.orderId },
      data: {
        status: data.status,
        cargoCode,
        verifiedAt: data.markVerified || data.status !== "VERIFICATION" ? new Date() : order.verifiedAt,
        statusHistory: {
          create: {
            status: data.status,
            note: data.note || `Статус ажуриран на ${data.status}`,
          },
        },
      },
      include: { statusHistory: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json({ order: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function GET() {
  try {
    await requireAdmin();
    const [orders, parts, prebuilts, users, settings] = await Promise.all([
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        include: { prebuilt: true, items: { include: { part: { select: { imageUrl: true } } } } },
      }),
      prisma.part.findMany({ orderBy: { category: "asc" } }),
      prisma.prebuilt.findMany({ orderBy: { priceMkd: "asc" } }),
      prisma.user.findMany({
        select: { id: true, email: true, name: true, role: true, phone: true, isHeadAdmin: true },
      }),
      prisma.siteSettings.findUnique({ where: { id: 1 } }),
    ]);

    const revenue = orders
      .filter((o) => o.status === "DELIVERED_PAID")
      .reduce((s, o) => s + o.totalMkd, 0);

    return NextResponse.json({
      orders,
      parts,
      prebuilts,
      users,
      settings,
      analytics: {
        revenue,
        orderCount: orders.length,
        byStatus: Object.fromEntries(
          ORDER_STATUSES.map((s) => [s, orders.filter((o) => o.status === s).length])
        ),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

const settingsSchema = z.object({
  assemblyFeeMkd: z.number().int().min(0),
});

export async function PUT(req: Request) {
  try {
    await requireHeadAdmin();
    const data = settingsSchema.parse(await req.json());
    const settings = await prisma.siteSettings.update({
      where: { id: 1 },
      data: { assemblyFeeMkd: data.assemblyFeeMkd },
    });
    return NextResponse.json({ settings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

const deleteOrderSchema = z.object({
  orderId: z.string().min(1),
});

export async function DELETE(req: Request) {
  try {
    await requireAdmin();
    const data = deleteOrderSchema.parse(await req.json());
    const order = await prisma.order.findUnique({ where: { id: data.orderId } });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.order.delete({ where: { id: data.orderId } });
    return NextResponse.json({ ok: true, trackingCode: order.trackingCode });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
