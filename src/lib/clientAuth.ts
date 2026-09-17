/** Client-side session helpers */

export type ClientUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export async function fetchSessionUser(): Promise<ClientUser | null> {
  try {
    const r = await fetch("/api/auth/me");
    const d = await r.json();
    return d.user ?? null;
  } catch {
    return null;
  }
}

/** Build /login?next=… with a safe relative path */
export function loginUrl(nextPath: string): string {
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return `/login?next=${encodeURIComponent(next)}`;
}

/** Only allow same-origin relative redirects */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}
