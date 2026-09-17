import { resolveCaseImage } from "./caseImages";
import { exactPartImagePath } from "./exactParts";

type PartLike = {
  brand?: string | null;
  name?: string | null;
  category?: string | null;
  imageUrl?: string | null;
};

/** Anhoch blocks hotlinking — serve their media through our proxy. */
export function proxiedExternalImage(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "www.anhoch.com" || u.hostname === "anhoch.com") {
      return `/api/media/proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {
    /* local path */
  }
  return url;
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
