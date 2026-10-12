import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { refreshClassifiedListings } from "@/lib/classifiedListings";
import { refreshStoreCatalog } from "@/lib/storeCatalogRefresh";

export const runtime = "nodejs";
export const maxDuration = 300;

function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const actualBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(actualBuf, expectedBuf);
}

/** Daily store refresh. Vercel Cron calls GET with Authorization: Bearer CRON_SECRET. */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const [store, classified] = await Promise.allSettled([
      refreshStoreCatalog(),
      refreshClassifiedListings(),
    ]);
    if (store.status === "rejected") {
      const msg = store.reason instanceof Error ? store.reason.message : "Error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    return NextResponse.json({
      ...store.value,
      classified:
        classified.status === "fulfilled"
          ? classified.value
          : { error: classified.reason instanceof Error ? classified.reason.message : "Error" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
