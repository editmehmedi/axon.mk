import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["active", "rejected", "hidden"]),
});

export async function GET() {
  try {
    await requireAdmin();
    const items = await prisma.userListing.findMany({
      where: { status: { not: "hidden" } },
      include: {
        seller: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    });

    return NextResponse.json({
      items: items.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        description: row.description,
        priceMkd: row.priceMkd,
        imageUrl: row.imageUrl,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        sellerId: row.sellerId,
        sellerName: row.seller.name,
        sellerEmail: row.seller.email,
        sellerPhone: row.seller.phone,
      })),
      pendingCount: items.filter((i) => i.status === "pending").length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.userListing.findUnique({ where: { id: body.id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const item = await prisma.userListing.update({
      where: { id: body.id },
      data: { status: body.status },
      include: {
        seller: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    return NextResponse.json({
      item: {
        id: item.id,
        name: item.name,
        category: item.category,
        description: item.description,
        priceMkd: item.priceMkd,
        imageUrl: item.imageUrl,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        sellerId: item.sellerId,
        sellerName: item.seller.name,
        sellerEmail: item.seller.email,
        sellerPhone: item.seller.phone,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function DELETE(req: Request) {
  try {
    await requireAdmin();
    const body = deleteSchema.parse(await req.json());

    const existing = await prisma.userListing.findUnique({ where: { id: body.id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.userListing.delete({ where: { id: body.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
