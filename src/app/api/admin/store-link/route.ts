import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { findStoreProductUrl } from "@/lib/storeProductLink";
import { getSupplierStore, normalizeStoreId } from "@/lib/partStores";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const store = params.get("store")?.trim() ?? "";
  const query = params.get("q")?.trim() ?? "";
  const category = params.get("category")?.trim() ?? "";
  const known = normalizeStoreId(store);
  const homepage = known ? getSupplierStore(known).homepage : null;

  try {
    await requireAdmin();
    const url = homepage ? await findStoreProductUrl(store, query, category) : null;
    if (!url) return NextResponse.redirect(new URL("/admin", req.url));
    return NextResponse.redirect(url);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message === "UNAUTHORIZED" || message === "FORBIDDEN") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (homepage) return NextResponse.redirect(homepage);
    return NextResponse.redirect(new URL("/admin", req.url));
  }
}
