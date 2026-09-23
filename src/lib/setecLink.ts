const SEARCH_URL = "https://search.sp.solslab.dev/indexes/products/search";
// Public search key already shipped in Setec's browser storefront.
const SEARCH_API_KEY =
  "c0424dab588b8cbbbe0a4809fc10b5f1c0c7d183b5b28ebe799f3fbf583ab358";

type SetecHit = {
  handle?: string;
  title?: string;
};

export function setecSearchQuery(label: string): string {
  return label
    .replace(/\s*×\s*\d+\s*$/u, "")
    .replace(/\s*\(\d+\/\d+\)\s*$/u, "")
    .replace(/\s*\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTitle(query: string, title: string): number {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 1);
  const hay = title.toLowerCase();
  return tokens.reduce((score, token) => (hay.includes(token) ? score + 1 : score), 0);
}

function productUrl(handle: string): string | null {
  const slug = handle.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return `https://setec.mk/products/${slug}`;
}

/** Setec product page for a part name, or the Setec search page if none matches. */
export async function findSetecProductUrl(label: string): Promise<string> {
  const query = setecSearchQuery(label);
  const fallback = `https://setec.mk/search?q=${encodeURIComponent(query || label)}`;
  if (!query) return fallback;

  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SEARCH_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        q: query,
        hitsPerPage: 8,
        page: 1,
        filter: "status = 'published' AND is_web_active = 'true'",
        matchingStrategy: "last",
      }),
      cache: "no-store",
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as { hits?: SetecHit[] };
    const hits = data.hits ?? [];
    let best: { url: string; score: number } | null = null;
    for (const hit of hits) {
      const url = hit.handle ? productUrl(hit.handle) : null;
      if (!url || !hit.title) continue;
      const score = scoreTitle(query, hit.title);
      if (!best || score > best.score) best = { url, score };
    }
    if (!best || best.score < 2) return fallback;
    return best.url;
  } catch {
    return fallback;
  }
}
