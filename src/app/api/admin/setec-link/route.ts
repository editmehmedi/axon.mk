import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { findSetecProductUrl } from "@/lib/setecLink";

export async function GET(req: Request) {
  const query = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  try {
    await requireAdmin();
    const url = await findSetecProductUrl(query);
    return NextResponse.redirect(url);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message === "UNAUTHORIZED" || message === "FORBIDDEN") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    const fallback = `https://setec.mk/search?q=${encodeURIComponent(query)}`;
    return NextResponse.redirect(fallback);
  }
}
