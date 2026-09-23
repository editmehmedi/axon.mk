import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  checkCompatibility,
  hasBlockingErrors,
  isNonePart,
  isStockCoolerPart,
  MAX_RAM_STICKS,
  MAX_SSD_QTY,
} from "@/lib/compatibility";
import { generateTrackingCode, BUILDER_STEPS } from "@/lib/constants";
import { sendAdminNewOrderEmail, sendOrderConfirmationEmail } from "@/lib/email";
import { ORDER_NOTE } from "@/lib/orderNotes";

function normalizeListingId(id: string) {
  return id.startsWith("listing:") ? id.slice("listing:".length) : id;
}

function isCatalogPartId(id: string) {
  return Boolean(id) && !id.startsWith("none:") && !id.startsWith("listing:");
}

const customerSchema = z.object({
  customerName: z.string().trim().min(2),
  customerPhone: z.string().trim().min(6),
  customerEmail: z.string().trim().email(),
  customerAddress: z.string().trim().min(3),
  city: z.string().trim().min(2),
});

function isZodError(e: unknown): e is z.ZodError {
  return Boolean(e && typeof e === "object" && (e as { name?: string }).name === "ZodError");
}

function friendlyOrderError(error: z.ZodError): string {
  const labels: Record<string, string> = {
    customerName: "Name must be at least 2 characters",
    customerPhone: "Phone must be at least 6 characters",
    customerEmail: "Enter a valid email",
    customerAddress: "Address must be at least 3 characters",
    city: "City must be at least 2 characters",
  };
  const lines = error.issues.map((issue) => {
    const key = String(issue.path[0] ?? "");
    return labels[key] ?? "Check the order details and try again";
  });
  return [...new Set(lines)].join(". ");
}

const prebuiltOrderSchema = customerSchema.extend({
  type: z.literal("PREBUILT"),
  prebuiltId: z.string(),
});

const customOrderSchema = customerSchema.extend({
  type: z.literal("CUSTOM"),
  partIds: z.array(z.string()).default([]),
  listingIds: z.array(z.string()).default([]),
  selfBuild: z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Session expired — sign out and sign in again" },
        { status: 401 },
      );
    }

    if (body.type === "PREBUILT") {
      const data = prebuiltOrderSchema.parse(body);
      const prebuilt = await prisma.prebuilt.findUnique({ where: { id: data.prebuiltId } });
      if (!prebuilt || !prebuilt.active) {
        return NextResponse.json({ error: "Конфигурацијата не е достапна" }, { status: 404 });
      }
      if (prebuilt.stock < 1) {
        return NextResponse.json({ error: "Нема на залиха" }, { status: 400 });
      }

      const trackingCode = generateTrackingCode();
      const order = await prisma.$transaction(async (tx) => {
        await tx.prebuilt.update({
          where: { id: prebuilt.id },
          data: { stock: { decrement: 1 } },
        });
        return tx.order.create({
          data: {
            trackingCode,
            type: "PREBUILT",
            status: "VERIFICATION",
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            customerEmail: data.customerEmail,
            customerAddress: data.customerAddress,
            city: data.city,
            partsCostMkd: prebuilt.priceMkd,
            assemblyFeeMkd: 0,
            selfBuild: false,
            totalMkd: prebuilt.priceMkd,
            paymentMethod: "COD",
            userId: session.id,
            prebuiltId: prebuilt.id,
            notes: ORDER_NOTE.AWAITING_PHONE,
            statusHistory: {
              create: {
                status: "VERIFICATION",
                note: ORDER_NOTE.PREBUILT_CREATED,
              },
            },
          },
        });
      });

      const mailPayload = {
        to: data.customerEmail,
        customerName: data.customerName,
        trackingCode: order.trackingCode,
        orderType: "PREBUILT" as const,
        productName: prebuilt.name,
        lines: [
          { category: "CPU", label: prebuilt.cpuLabel },
          { category: "Cooler", label: prebuilt.coolerLabel },
          { category: "Motherboard", label: prebuilt.motherboardLabel },
          { category: "RAM", label: prebuilt.ramLabel },
          { category: "GPU", label: prebuilt.gpuLabel },
          { category: "SSD", label: prebuilt.ssdLabel },
          { category: "PSU", label: prebuilt.psuLabel },
          { category: "Case", label: prebuilt.caseLabel },
        ].filter((l) => Boolean(l.label?.trim())),
        partsCostMkd: prebuilt.priceMkd,
        assemblyFeeMkd: 0,
        totalMkd: prebuilt.priceMkd,
        customerPhone: data.customerPhone,
        customerAddress: data.customerAddress,
        city: data.city,
      };
      try {
        await sendOrderConfirmationEmail(mailPayload);
      } catch (mailErr) {
        console.error("[email] failed to send order confirmation", mailErr);
      }
      try {
        await sendAdminNewOrderEmail(mailPayload);
      } catch (mailErr) {
        console.error("[email] failed to send admin order notice", mailErr);
      }

      return NextResponse.json({ order });
    }

    if (body.type === "CUSTOM") {
      const data = customOrderSchema.parse(body);
      const partIds = (data.partIds ?? []).filter(isCatalogPartId);
      const listingIds = [...new Set((data.listingIds ?? []).map(normalizeListingId).filter(Boolean))];
      if (partIds.length + listingIds.length < 1) {
        return NextResponse.json({ error: "Нема избрани делови" }, { status: 400 });
      }

      const parts = partIds.length
        ? await prisma.part.findMany({
            where: { id: { in: [...new Set(partIds)] }, active: true },
          })
        : [];
      if (parts.length !== new Set(partIds).size) {
        return NextResponse.json({ error: "Некои делови не се достапни" }, { status: 400 });
      }

      const partQty = new Map<string, number>();
      for (const id of partIds) {
        partQty.set(id, (partQty.get(id) ?? 0) + 1);
      }

      const listings = listingIds.length
        ? await prisma.userListing.findMany({
            where: { id: { in: listingIds }, status: "active" },
          })
        : [];
      if (listings.length !== listingIds.length) {
        return NextResponse.json(
          { error: "Некои половни делови не се достапни" },
          { status: 400 },
        );
      }

      type SelItem = {
        id: string;
        category: string;
        name: string;
        brand?: string;
        priceMkd: number;
        socket?: string | null;
        ramType?: string | null;
        wattage?: number | null;
        tdpWatts?: number | null;
        formFactor?: string | null;
        includesCooler?: boolean | null;
        kind: "part" | "listing";
      };

      const selection: Record<string, SelItem | SelItem[]> = {};
      const lineItems: SelItem[] = [];

      for (const p of parts) {
        const qty = partQty.get(p.id) ?? 1;
        for (let i = 0; i < qty; i++) {
          const item: SelItem = {
            id: p.id,
            category: p.category,
            name: p.name,
            brand: p.brand,
            priceMkd: p.priceMkd,
            socket: p.socket,
            ramType: p.ramType,
            wattage: p.wattage,
            tdpWatts: p.tdpWatts,
            formFactor: p.formFactor,
            includesCooler: p.includesCooler,
            kind: "part",
          };
          lineItems.push(item);
          if (p.category === "SSD") {
            const list = (selection.SSD as SelItem[] | undefined) ?? [];
            if (list.length && list[0].id !== p.id) {
              return NextResponse.json(
                { error: `Дупликат категорија: ${p.category}` },
                { status: 400 },
              );
            }
            if (qty > MAX_SSD_QTY) {
              return NextResponse.json(
                { error: `Максимум ${MAX_SSD_QTY} SSD` },
                { status: 400 },
              );
            }
            selection.SSD = [item];
          } else if (p.category === "RAM") {
            const existing = selection.RAM as SelItem | undefined;
            if (existing && existing.id !== p.id) {
              return NextResponse.json(
                { error: `Дупликат категорија: ${p.category}` },
                { status: 400 },
              );
            }
            if (qty > MAX_RAM_STICKS) {
              return NextResponse.json(
                { error: `Максимум ${MAX_RAM_STICKS} RAM` },
                { status: 400 },
              );
            }
            selection.RAM = item;
          } else if (selection[p.category]) {
            return NextResponse.json(
              { error: `Дупликат категорија: ${p.category}` },
              { status: 400 },
            );
          } else {
            selection[p.category] = item;
          }
        }
      }

      for (const l of listings) {
        if (l.category === "OTHER" || !(BUILDER_STEPS as readonly string[]).includes(l.category)) {
          return NextResponse.json(
            { error: "PC/Other listings cannot be used in the builder" },
            { status: 400 },
          );
        }
        const item: SelItem = {
          id: l.id,
          category: l.category,
          name: l.name,
          brand: "Used",
          priceMkd: l.priceMkd,
          kind: "listing",
        };
        lineItems.push(item);
        if (l.category === "SSD") {
          if (selection.SSD) {
            return NextResponse.json(
              { error: `Дупликат категорија: ${l.category}` },
              { status: 400 },
            );
          }
          selection.SSD = [item];
        } else if (selection[l.category]) {
          return NextResponse.json(
            { error: `Дупликат категорија: ${l.category}` },
            { status: 400 },
          );
        } else {
          selection[l.category] = item;
        }
      }

      const single = (cat: string) => {
        const v = selection[cat];
        return v && !Array.isArray(v) ? v : null;
      };

      const ramItem = single("RAM");
      const ssdList = Array.isArray(selection.SSD)
        ? selection.SSD
        : selection.SSD
          ? [selection.SSD]
          : null;
      const ramQty = ramItem ? (partQty.get(ramItem.id) ?? 1) : 1;
      const ssdQty = ssdList?.[0] ? (partQty.get(ssdList[0].id) ?? 1) : 1;

      const issues = checkCompatibility(
        {
          CPU: single("CPU"),
          COOLER: single("COOLER"),
          GPU: single("GPU"),
          MOTHERBOARD: single("MOTHERBOARD"),
          RAM: ramItem,
          PSU: single("PSU"),
          CASE: single("CASE"),
          SSD: ssdList,
        },
        { ramQty, ssdQty },
      );
      if (hasBlockingErrors(issues)) {
        return NextResponse.json({ error: "Некомпатибилна конфигурација", issues }, { status: 400 });
      }
      if (!single("PSU")) {
        return NextResponse.json({ error: "A power supply is required" }, { status: 400 });
      }

      const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
      const fee = settings?.assemblyFeeMkd ?? 2999;
      const collapsed = new Map<string, { item: SelItem; qty: number }>();
      for (const p of lineItems) {
        const key = `${p.kind}:${p.id}:${p.category}`;
        const cur = collapsed.get(key);
        if (cur) cur.qty += 1;
        else collapsed.set(key, { item: p, qty: 1 });
      }
      const orderLines = Array.from(collapsed.values());
      const partsCost = orderLines.reduce((s, row) => s + row.item.priceMkd * row.qty, 0);
      const assemblyFeeMkd = fee;
      const totalMkd = partsCost + assemblyFeeMkd;
      const trackingCode = generateTrackingCode();

      const order = await prisma.$transaction(async (tx) => {
        for (const p of parts) {
          if (isStockCoolerPart(p) || isNonePart(p)) continue;
          const qty = partQty.get(p.id) ?? 1;
          if (p.stock < qty) throw new Error(`Нема залиха: ${p.name}`);
          await tx.part.update({
            where: { id: p.id },
            data: { stock: { decrement: qty } },
          });
        }
        for (const l of listings) {
          const updated = await tx.userListing.updateMany({
            where: { id: l.id, status: "active" },
            data: { status: "sold" },
          });
          if (updated.count !== 1) {
            throw new Error(`Половниот дел веќе е продаден: ${l.name}`);
          }
        }
        return tx.order.create({
          data: {
            trackingCode,
            type: "CUSTOM",
            status: "VERIFICATION",
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            customerEmail: data.customerEmail,
            customerAddress: data.customerAddress,
            city: data.city,
            partsCostMkd: partsCost,
            assemblyFeeMkd,
            selfBuild: false,
            totalMkd,
            paymentMethod: "COD",
            userId: session.id,
            notes: ORDER_NOTE.CUSTOM_AWAITING,
            items: {
              create: orderLines.map(({ item: p, qty }) => ({
                ...(p.kind === "part" ? { partId: p.id } : {}),
                label: p.brand ? `${p.brand} ${p.name}` : p.name,
                category: p.category,
                priceMkd: p.priceMkd,
                qty,
              })),
            },
            statusHistory: {
              create: {
                status: "VERIFICATION",
                note: ORDER_NOTE.CUSTOM_CREATED,
              },
            },
          },
        });
      });

      const mailPayload = {
        to: data.customerEmail,
        customerName: data.customerName,
        trackingCode: order.trackingCode,
        orderType: "CUSTOM" as const,
        productName: "Custom PC Build",
        lines: orderLines.map(({ item: p, qty }) => ({
          category: p.category,
          label: `${p.brand ? `${p.brand} ${p.name}` : p.name}${qty > 1 ? ` ×${qty}` : ""}`,
          priceMkd: p.priceMkd * qty,
        })),
        partsCostMkd: partsCost,
        assemblyFeeMkd,
        totalMkd,
        customerPhone: data.customerPhone,
        customerAddress: data.customerAddress,
        city: data.city,
      };
      try {
        await sendOrderConfirmationEmail(mailPayload);
      } catch (mailErr) {
        console.error("[email] failed to send order confirmation", mailErr);
      }
      try {
        await sendAdminNewOrderEmail(mailPayload);
      } catch (mailErr) {
        console.error("[email] failed to send admin order notice", mailErr);
      }

      return NextResponse.json({ order });
    }

    return NextResponse.json({ error: "Невалиден тип" }, { status: 400 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json(
        { error: "Session expired — sign out and sign in again" },
        { status: 401 },
      );
    }
    if (isZodError(e)) {
      return NextResponse.json({ error: friendlyOrderError(e) }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const session = await getSession();
  const { searchParams } = new URL(req.url);
  const mine = searchParams.get("mine");

  if (session && (session.role === "admin" || session.role === "head_admin") && !mine) {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: { prebuilt: true, items: true, statusHistory: { orderBy: { createdAt: "asc" } } },
    });
    return NextResponse.json({ orders });
  }

  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const orders = await prisma.order.findMany({
    where: {
      OR: [{ userId: session.id }, { customerEmail: session.email }],
    },
    orderBy: { createdAt: "desc" },
    include: { prebuilt: true, items: true, statusHistory: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json({ orders });
}
