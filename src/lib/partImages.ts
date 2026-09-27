import { resolveCaseImage } from "./caseImages";
import { exactPartImagePath } from "./exactParts";

type PartLike = {
  brand?: string | null;
  name?: string | null;
  category?: string | null;
  imageUrl?: string | null;
};

const SHOP_IMAGE_HOSTS = new Set([
  "www.anhoch.com",
  "anhoch.com",
  "setec-pos-web.fra1.cdn.digitaloceanspaces.com",
  "www.neptun.mk",
  "neptun.mk",
  "50cdn.gjirafamall.tech",
]);

function isImagePath(pathname: string): boolean {
  return /\.(jpe?g|png|webp|gif|avif)$/i.test(pathname);
}

/** Shop CDNs that refuse to show a photo when the page is axon.mk. */
export function isShopImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    try {
      parsed = new URL(encodeURI(url));
    } catch {
      return false;
    }
  }
  if (parsed.protocol !== "https:" || !SHOP_IMAGE_HOSTS.has(parsed.hostname)) return false;
  const path = parsed.pathname;
  if (parsed.hostname.endsWith("anhoch.com")) return path.startsWith("/storage/") && isImagePath(path);
  if (parsed.hostname === "50cdn.gjirafamall.tech") return path.startsWith("/images/") && isImagePath(path);
  return isImagePath(path);
}

/**
 * Anhoch and Neptun block axon.mk as a referrer, and Cloudflare blocks the
 * server from downloading their photos. The browser can load those URLs when
 * it sends no referrer. Setec and Gjirafa still go through the proxy.
 */
function browserLoadsDirectly(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.endsWith("anhoch.com") || host.endsWith("neptun.mk");
  } catch {
    return false;
  }
}

/** Serve shop photos so hotlink protection does not hide them. */
export function proxiedExternalImage(url: string): string {
  if (!isShopImageUrl(url) || browserLoadsDirectly(url)) return url;
  return `/api/media/proxy?url=${encodeURIComponent(url)}`;
}

/** Prefer DB imageUrl, else exact per-item file, else smart fallback. */
export function resolvePartImage(part: PartLike): string {
  if (part.imageUrl) return proxiedExternalImage(part.imageUrl);

  const brand = part.brand || "";
  const name = part.name || "";
  const category = (part.category || "").toUpperCase();

  if (brand && name) {
    return exactPartImagePath(brand, name);
  }

  if (category === "CASE") {
    return resolveCaseImage(`${brand} ${name}`).src;
  }

  return "/parts/ssd.png";
}

export function resolvePrebuiltImage(
  slug?: string | null,
  imageUrl?: string | null,
  caseLabel?: string | null,
): string {
  // Prefer the stored case product photo (unique per prebuilt)
  if (imageUrl?.trim()) {
    return proxiedExternalImage(imageUrl);
  }
  if (caseLabel?.trim()) {
    return resolveCaseImage(caseLabel).src;
  }
  const s = (slug || "").toLowerCase();
  if (
    s.includes("esports") ||
    s.includes("1440") ||
    s.includes("stream") ||
    s.includes("pulse") ||
    s.includes("creator") ||
    s.includes("value") ||
    s.includes("1080p")
  ) {
    return "/prebuilts/prebuilt-esports.png";
  }
  if (
    s.includes("work") ||
    s.includes("content") ||
    s.includes("studio") ||
    s.includes("flagship") ||
    s.includes("titan") ||
    s.includes("apex") ||
    s.includes("ultra") ||
    s.includes("4k") ||
    s.includes("high-refresh")
  ) {
    return "/prebuilts/prebuilt-workstation.png";
  }
  return "/prebuilts/prebuilt-starter.png";
}
