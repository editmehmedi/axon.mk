import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** Sellers may only mark sold / hide / resubmit for review — never self-approve. */
const sellerPatchSchema = z.object({
  status: z.enum(["sold", "hidden", "pending"]),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireUser();
    const { id } = await ctx.params;
    const body = sellerPatchSchema.parse(await req.json());

    const existing = await prisma.userListing.findUnique({ where: { id } });
    if (!existing || existing.sellerId !== session.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (body.status === "sold" && existing.status !== "active") {
      return NextResponse.json(
        { error: "Only approved listings can be marked sold" },
        { status: 400 },
      );
    }

    if (body.status === "pending" && !["sold", "rejected"].includes(existing.status)) {
      return NextResponse.json(
        { error: "Only sold or rejected listings can be resubmitted" },
        { status: 400 },
      );
    }

    const item = await prisma.userListing.update({
      where: { id },
      data: { status: body.status },
      include: {
        seller: { select: { id: true, name: true, phone: true, email: true } },
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
        sellerPhone: item.seller.phone ?? null,
        sellerEmail: item.seller.email ?? null,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { error: msg === "UNAUTHORIZED" ? "UNAUTHORIZED" : "Update failed" },
      { status },
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireUser();
    const { id } = await ctx.params;

    const existing = await prisma.userListing.findUnique({ where: { id } });
    if (!existing || existing.sellerId !== session.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.userListing.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { error: msg === "UNAUTHORIZED" ? "UNAUTHORIZED" : "Delete failed" },
      { status },
    );
  }
}
