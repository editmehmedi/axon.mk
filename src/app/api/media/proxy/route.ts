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

/** Some shop CDNs omit Content-Type when the request comes from the host. */
function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
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
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const body = await upstream.arrayBuffer();
    const bytes = new Uint8Array(body);
    const headerType = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const contentType = headerType.startsWith("image/") ? headerType : sniffImageType(bytes);
    if (!contentType) {
      return NextResponse.json({ error: "Not an image" }, { status: 502 });
    }

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
