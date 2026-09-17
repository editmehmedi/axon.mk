import { BUILDER_STEPS } from "@/lib/constants";
import { createNonePart, type CompatPart, type CompatSelection } from "@/lib/compatibility";

const DRAFT_KEY = "axon_builder_draft";
const CHECKOUT_KEY = "axon_builder_checkout";

export type BuilderDraft = {
  v: 1;
  condition: "new" | "used";
  step: number;
  ids: Partial<Record<(typeof BUILDER_STEPS)[number], string | string[] | null>>;
  ramQtyById: Record<string, number>;
  ssdQtyById: Record<string, number>;
};

export function saveBuilderDraft(draft: Omit<BuilderDraft, "v">) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, ...draft }));
  } catch {
    /* quota / private mode */
  }
}

export function loadBuilderDraft(): BuilderDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<BuilderDraft>;
    if (data?.v !== 1 || !data.ids || typeof data.ids !== "object") return null;
    return {
      v: 1,
      condition: data.condition === "used" ? "used" : "new",
      step: Number.isFinite(data.step) ? Number(data.step) : 0,
      ids: data.ids,
      ramQtyById: data.ramQtyById && typeof data.ramQtyById === "object" ? data.ramQtyById : {},
      ssdQtyById: data.ssdQtyById && typeof data.ssdQtyById === "object" ? data.ssdQtyById : {},
    };
  } catch {
    return null;
  }
}

export function clearBuilderDraft() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(CHECKOUT_KEY);
}

export function markBuilderCheckoutPending() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHECKOUT_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function peekBuilderCheckoutPending(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CHECKOUT_KEY) === "1";
}

export function consumeBuilderCheckoutPending() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CHECKOUT_KEY);
}

export function serializeSelection(sel: CompatSelection): BuilderDraft["ids"] {
  const ids: BuilderDraft["ids"] = {};
  for (const cat of BUILDER_STEPS) {
    if (cat === "SSD") {
      ids.SSD = sel.SSD ? sel.SSD.map((p) => p.id) : null;
      continue;
    }
    const part = sel[cat];
    ids[cat] = part ? part.id : null;
  }
  return ids;
}

export function draftHasPicks(ids: BuilderDraft["ids"] | undefined): boolean {
  if (!ids) return false;
  return BUILDER_STEPS.some((cat) => {
    const value = ids[cat];
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  });
}

export function draftNeedsCatalog(ids: BuilderDraft["ids"] | undefined): boolean {
  if (!ids) return false;
  return BUILDER_STEPS.some((cat) => {
    const raw = ids[cat];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return list.some((id) => id && !id.startsWith("none:"));
  });
}

export function hydrateSelection(
  ids: BuilderDraft["ids"],
  catalog: CompatPart[],
): CompatSelection {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const resolve = (id: string): CompatPart | null => {
    if (id.startsWith("none:")) return createNonePart(id.slice("none:".length));
    return byId.get(id) ?? null;
  };

  const sel: CompatSelection = {};
  for (const cat of BUILDER_STEPS) {
    const raw = ids[cat];
    if (cat === "SSD") {
      const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
      const parts = list.map(resolve).filter((p): p is CompatPart => Boolean(p));
      if (parts.length) sel.SSD = parts;
      continue;
    }
    if (typeof raw !== "string" || !raw) continue;
    const part = resolve(raw);
    if (part) sel[cat] = part;
  }
  return sel;
}
