import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, requireUser } from "@/lib/auth";
import { isListingCategory, LISTING_CATEGORIES } from "@/lib/listingCategories";

const specField = z.string().trim().max(120).optional().default("");

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(1),
  priceMkd: z.coerce.number().int().min(1).max(10_000_000),
  imageUrl: z.union([z.string().max(2000), z.null()]).optional(),
  description: z.union([z.string().max(2000), z.null()]).optional(),
  cpuLabel: specField,
  coolerLabel: specField,
  motherboardLabel: specField,
  ramLabel: specField,
  gpuLabel: specField,
  ssdLabel: specField,
  psuLabel: specField,
  caseLabel: specField,
});

const PC_REQUIRED_SPECS = [
  "cpuLabel",
  "gpuLabel",
  "ramLabel",
  "ssdLabel",
  "psuLabel",
  "coolerLabel",
  "motherboardLabel",
  "caseLabel",
] as const;

function mapListing(row: {
  id: string;
  name: string;
  category: string;
  description: string;
  priceMkd: number;
  imageUrl: string | null;
  status: string;
  createdAt: Date;
  sellerId: string;
  cpuLabel?: string;
  coolerLabel?: string;
  motherboardLabel?: string;
  ramLabel?: string;
  gpuLabel?: string;
  ssdLabel?: string;
  psuLabel?: string;
  caseLabel?: string;
  seller: { id: string; name: string; phone?: string | null; email?: string };
}) {
  return {
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
    sellerPhone: row.seller.phone ?? null,
    sellerEmail: row.seller.email ?? null,
    cpuLabel: row.cpuLabel ?? "",
    coolerLabel: row.coolerLabel ?? "",
    motherboardLabel: row.motherboardLabel ?? "",
    ramLabel: row.ramLabel ?? "",
    gpuLabel: row.gpuLabel ?? "",
    ssdLabel: row.ssdLabel ?? "",
    psuLabel: row.psuLabel ?? "",
    caseLabel: row.caseLabel ?? "",
  };
}

function isZodError(e: unknown): e is z.ZodError {
  return Boolean(e && typeof e === "object" && (e as { name?: string }).name === "ZodError");
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Public: active (approved) listings. ?mine=1 returns the signed-in seller's listings. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mine = url.searchParams.get("mine") === "1";
    const session = await getSession();

    if (mine) {
      if (!session) {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
      }
      const items = await prisma.userListing.findMany({
        where: { sellerId: session.id, status: { not: "hidden" } },
        include: {
          seller: { select: { id: true, name: true, phone: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ items: items.map(mapListing) });
    }

    const category = url.searchParams.get("category")?.trim() || "";
    const partsOnly = url.searchParams.get("partsOnly") === "1";
    const items = await prisma.userListing.findMany({
      where: {
        status: "active",
        ...(category && isListingCategory(category) ? { category } : {}),
        ...(partsOnly && !category
          ? { NOT: { category: { in: ["PC"] } } }
          : {}),
      },
      include: {
        seller: { select: { id: true, name: true, phone: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ items: items.map(mapListing) });
  } catch (e) {
    console.error("[sell GET]", e);
    return NextResponse.json({ error: "Failed to load listings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireUser();
    const body = createSchema.parse(await req.json());

    if (!isListingCategory(body.category)) {
      return NextResponse.json(
        { error: `Category must be one of: ${LISTING_CATEGORIES.join(", ")}` },
        { status: 400 },
      );
    }

    if (body.category === "PC") {
      const missing = PC_REQUIRED_SPECS.filter((k) => !String(body[k] ?? "").trim());
      if (missing.length) {
        return NextResponse.json(
          {
            error: `Sell PC requires all specs: CPU, Cooler, Motherboard, RAM, GPU, SSD, PSU, Case`,
            missing,
          },
          { status: 400 },
        );
      }
    }

    const seller = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true },
    });
    if (!seller) {
      return NextResponse.json(
        { error: "Session expired — sign out and sign in again" },
        { status: 401 },
      );
    }

    const imageUrl =
      typeof body.imageUrl === "string" && body.imageUrl.trim()
        ? body.imageUrl.trim()
        : null;
    const description =
      typeof body.description === "string" ? body.description.trim() : "";

    const isPc = body.category === "PC";
    const specs = {
      cpuLabel: isPc ? body.cpuLabel.trim() : "",
      coolerLabel: isPc ? body.coolerLabel.trim() : "",
      motherboardLabel: isPc ? body.motherboardLabel.trim() : "",
      ramLabel: isPc ? body.ramLabel.trim() : "",
      gpuLabel: isPc ? body.gpuLabel.trim() : "",
      ssdLabel: isPc ? body.ssdLabel.trim() : "",
      psuLabel: isPc ? body.psuLabel.trim() : "",
      caseLabel: isPc ? body.caseLabel.trim() : "",
    };

    let listing = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        listing = await prisma.userListing.create({
          data: {
            sellerId: session.id,
            name: body.name,
            category: body.category,
            priceMkd: body.priceMkd,
            imageUrl,
            description,
            ...specs,
            status: "pending",
          },
          include: {
            seller: { select: { id: true, name: true, phone: true, email: true } },
          },
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : "";
        const locked =
          msg.includes("database is locked") ||
          msg.includes("SQLITE_BUSY") ||
          msg.includes("P1008");
        if (!locked || attempt === 3) throw err;
        await sleep(120 * (attempt + 1));
      }
    }
    if (!listing) throw lastErr instanceof Error ? lastErr : new Error("Create failed");

    return NextResponse.json({ item: mapListing(listing) }, { status: 201 });
  } catch (e) {
    console.error("[sell POST]", e);
    if (isZodError(e)) {
      return NextResponse.json(
        { error: "Invalid listing data — check name (min 2 chars) and price" },
        { status: 400 },
      );
    }
    const msg = e instanceof Error ? e.message : "Error";
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    if (msg.includes("UserListing") || msg.includes("does not exist") || msg.includes("P2021")) {
      return NextResponse.json(
        { error: "Database missing UserListing — run npx prisma db push, then restart next dev" },
        { status: 500 },
      );
    }
    if (msg.includes("Foreign key") || msg.includes("P2003")) {
      return NextResponse.json(
        { error: "Session expired — sign out and sign in again" },
        { status: 401 },
      );
    }
    if (msg.includes("database is locked") || msg.includes("SQLITE_BUSY")) {
      return NextResponse.json(
        { error: "Database busy (OneDrive lock) — try again in a moment" },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "development"
            ? msg
            : "Failed to create listing",
      },
      { status: 500 },
    );
  }
}
