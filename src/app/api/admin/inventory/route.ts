import { NextResponse } from "next/server";
import { z } from "zod";
import { PartCategory } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

const categories = [
  "CPU",
  "GPU",
  "MOTHERBOARD",
  "RAM",
  "PSU",
  "CASE",
  "SSD",
  "COOLER",
] as const;

const partFields = {
  name: z.string().min(1).max(200),
  brand: z.string().min(1).max(80),
  category: z.enum(categories),
  priceMkd: z.number().int().min(0),
  stock: z.number().int().min(0),
  socket: z.string().max(40).optional().nullable(),
  ramType: z.string().max(40).optional().nullable(),
  wattage: z.number().int().min(0).optional().nullable(),
  tdpWatts: z.number().int().min(0).optional().nullable(),
  formFactor: z.string().max(40).optional().nullable(),
  includesCooler: z.boolean().optional(),
  imageUrl: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional(),
};

const createSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("part"),
    ...partFields,
  }),
  z.object({
    kind: z.literal("prebuilt"),
    name: z.string().min(2).max(120),
    slug: z.string().max(140).optional(),
    description: z.string().min(2).max(500),
    cpuLabel: z.string().min(1).max(120),
    coolerLabel: z.string().max(120).optional().default(""),
    motherboardLabel: z.string().max(120).optional().default(""),
    ramLabel: z.string().min(1).max(120),
    gpuLabel: z.string().min(1).max(120),
    ssdLabel: z.string().min(1).max(120),
    psuLabel: z.string().max(120).optional().default(""),
    caseLabel: z.string().max(120).optional().default(""),
    priceMkd: z.number().int().min(0),
    stock: z.number().int().min(0),
    imageUrl: z.string().max(2000).optional().nullable(),
    active: z.boolean().optional(),
    condition: z.enum(["new", "used"]).optional().default("new"),
    conditionGrade: z.string().max(40).optional().default(""),
  }),
]);

const updateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("part"),
    id: z.string().min(1),
    name: partFields.name.optional(),
    brand: partFields.brand.optional(),
    category: partFields.category.optional(),
    priceMkd: partFields.priceMkd.optional(),
    stock: partFields.stock.optional(),
    socket: partFields.socket,
    ramType: partFields.ramType,
    wattage: partFields.wattage,
    tdpWatts: partFields.tdpWatts,
    formFactor: partFields.formFactor,
    includesCooler: partFields.includesCooler,
    imageUrl: partFields.imageUrl,
    active: partFields.active,
  }),
  z.object({
    kind: z.literal("prebuilt"),
    id: z.string().min(1),
    name: z.string().min(2).max(120).optional(),
    description: z.string().min(2).max(500).optional(),
    cpuLabel: z.string().min(1).max(120).optional(),
    coolerLabel: z.string().max(120).optional(),
    motherboardLabel: z.string().max(120).optional(),
    ramLabel: z.string().min(1).max(120).optional(),
    gpuLabel: z.string().min(1).max(120).optional(),
    ssdLabel: z.string().min(1).max(120).optional(),
    psuLabel: z.string().max(120).optional(),
    caseLabel: z.string().max(120).optional(),
    priceMkd: z.number().int().min(0).optional(),
    stock: z.number().int().min(0).optional(),
    imageUrl: z.string().max(2000).optional().nullable(),
    active: z.boolean().optional(),
    condition: z.enum(["new", "used"]).optional(),
    conditionGrade: z.string().max(40).optional(),
  }),
]);

const deleteSchema = z.object({
  kind: z.enum(["part", "prebuilt"]),
  id: z.string().min(1),
});

function emptyToNull(v: string | null | undefined) {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function uniquePrebuiltSlug(base: string): Promise<string> {
  const root = slugify(base) || `axon-pc-${Date.now()}`;
  let candidate = root;
  let n = 2;
  while (await prisma.prebuilt.findUnique({ where: { slug: candidate } })) {
    candidate = `${root}-${n}`;
    n += 1;
  }
  return candidate;
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    // Back-compat: old clients posted part fields without kind
    const payload = body.kind ? body : { kind: "part", ...body };
    const data = createSchema.parse(payload);

    if (data.kind === "prebuilt") {
      const slug = await uniquePrebuiltSlug(data.slug?.trim() || data.name);
      const prebuilt = await prisma.prebuilt.create({
        data: {
          slug,
          name: data.name.trim(),
          description: data.description.trim(),
          cpuLabel: data.cpuLabel.trim(),
          coolerLabel: (data.coolerLabel || "").trim(),
          motherboardLabel: (data.motherboardLabel || "").trim(),
          ramLabel: data.ramLabel.trim(),
          gpuLabel: data.gpuLabel.trim(),
          ssdLabel: data.ssdLabel.trim(),
          psuLabel: (data.psuLabel || "").trim(),
          caseLabel: (data.caseLabel || "").trim(),
          priceMkd: data.priceMkd,
          stock: data.stock,
          imageUrl: emptyToNull(data.imageUrl),
          active: data.active ?? true,
          featured: true,
          deliveryHours: 24,
          condition: data.condition ?? "new",
          conditionGrade: (data.conditionGrade || "").trim(),
        },
      });
      return NextResponse.json({ prebuilt }, { status: 201 });
    }

    const part = await prisma.part.create({
      data: {
        name: data.name.trim(),
        brand: data.brand.trim(),
        category: data.category as PartCategory,
        priceMkd: data.priceMkd,
        stock: data.stock,
        socket: emptyToNull(data.socket),
        ramType: emptyToNull(data.ramType),
        wattage: data.wattage ?? null,
        tdpWatts: data.tdpWatts ?? null,
        formFactor: emptyToNull(data.formFactor),
        includesCooler: data.includesCooler ?? false,
        imageUrl: emptyToNull(data.imageUrl),
        active: data.active ?? true,
      },
    });
    return NextResponse.json({ part }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const data = updateSchema.parse(await req.json());

    if (data.kind === "prebuilt") {
      const prebuilt = await prisma.prebuilt.update({
        where: { id: data.id },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.description !== undefined ? { description: data.description.trim() } : {}),
          ...(data.cpuLabel !== undefined ? { cpuLabel: data.cpuLabel.trim() } : {}),
          ...(data.coolerLabel !== undefined ? { coolerLabel: data.coolerLabel.trim() } : {}),
          ...(data.motherboardLabel !== undefined
            ? { motherboardLabel: data.motherboardLabel.trim() }
            : {}),
          ...(data.ramLabel !== undefined ? { ramLabel: data.ramLabel.trim() } : {}),
          ...(data.gpuLabel !== undefined ? { gpuLabel: data.gpuLabel.trim() } : {}),
          ...(data.ssdLabel !== undefined ? { ssdLabel: data.ssdLabel.trim() } : {}),
          ...(data.psuLabel !== undefined ? { psuLabel: data.psuLabel.trim() } : {}),
          ...(data.caseLabel !== undefined ? { caseLabel: data.caseLabel.trim() } : {}),
          ...(data.priceMkd !== undefined ? { priceMkd: data.priceMkd } : {}),
          ...(data.stock !== undefined ? { stock: data.stock } : {}),
          ...(data.imageUrl !== undefined ? { imageUrl: emptyToNull(data.imageUrl) } : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
          ...(data.condition !== undefined ? { condition: data.condition } : {}),
          ...(data.conditionGrade !== undefined
            ? { conditionGrade: data.conditionGrade.trim() }
            : {}),
        },
      });
      return NextResponse.json({ prebuilt });
    }

    const part = await prisma.part.update({
      where: { id: data.id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.brand !== undefined ? { brand: data.brand.trim() } : {}),
        ...(data.category !== undefined ? { category: data.category as PartCategory } : {}),
        ...(data.priceMkd !== undefined ? { priceMkd: data.priceMkd } : {}),
        ...(data.stock !== undefined ? { stock: data.stock } : {}),
        ...(data.socket !== undefined ? { socket: emptyToNull(data.socket) } : {}),
        ...(data.ramType !== undefined ? { ramType: emptyToNull(data.ramType) } : {}),
        ...(data.wattage !== undefined ? { wattage: data.wattage } : {}),
        ...(data.tdpWatts !== undefined ? { tdpWatts: data.tdpWatts } : {}),
        ...(data.formFactor !== undefined ? { formFactor: emptyToNull(data.formFactor) } : {}),
        ...(data.includesCooler !== undefined ? { includesCooler: data.includesCooler } : {}),
        ...(data.imageUrl !== undefined ? { imageUrl: emptyToNull(data.imageUrl) } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });
    return NextResponse.json({ part });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();
    const data = deleteSchema.parse(await req.json());

    if (data.kind === "prebuilt") {
      await prisma.order.updateMany({
        where: { prebuiltId: data.id },
        data: { prebuiltId: null },
      });
      await prisma.prebuilt.delete({ where: { id: data.id } });
      return NextResponse.json({ ok: true });
    }

    // Detach from order lines so hard delete is safe
    await prisma.orderItem.updateMany({
      where: { partId: data.id },
      data: { partId: null },
    });

    await prisma.part.delete({ where: { id: data.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
