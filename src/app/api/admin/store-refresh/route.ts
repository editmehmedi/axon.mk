import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { refreshStoreCatalog } from "@/lib/storeCatalogRefresh";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    await requireAdmin();
    const result = await refreshStoreCatalog();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
