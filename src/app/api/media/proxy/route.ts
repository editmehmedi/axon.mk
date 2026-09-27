import { NextResponse } from "next/server";
import { isShopImageUrl } from "@/lib/partImages";

function parseImageUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    try {
      return new URL(encodeURI(raw));
    } catch {
      return null;
    }
  }
}

function refererFor(hostname: string): string {
  if (hostname.endsWith("anhoch.com")) return "https://www.anhoch.com/";
  if (hostname.endsWith("neptun.mk")) return "https://www.neptun.mk/";
  if (hostname.includes("digitaloceanspaces.com")) return "https://setec.mk/";
  if (hostname.endsWith("gjirafamall.tech")) return "https://gjirafa50.mk/";
  return "https://www.anhoch.com/";
}

/**
 * Shops block hotlinking. Proxy their product images so the catalog can display them.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const target = parseImageUrl(raw);
  if (!target || !isShopImageUrl(target.toString())) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: refererFor(target.hostname),
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      next: { revalidate: 60 * 60 * 24 * 7 },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Not an image" }, { status: 502 });
    }
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
}
