"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ASSEMBLY_FEE_DEFAULT, BUILDER_STEPS } from "@/lib/constants";
import {
  checkCompatibility,
  compatibilityFilterHint,
  createNonePart,
  cpuHasIntegratedGraphics,
  cpuNeedsCooler,
  filterCompatibleParts,
  clampRamQty,
  clampSsdQty,
  defaultRamQty,
  defaultSsdQty,
  estimatedPowerBreakdown,
  flattenSelection,
  getSsds,
  hasBlockingErrors,
  hasRealPsu,
  isNonePart,
  isStepComplete,
  isStockCoolerPart,
  motherboardRamSlots,
  motherboardSsdSlots,
  MAX_RAM_STICKS,
  MAX_SSD_QTY,
  MIN_RAM_STICKS,
  MIN_SSD_QTY,
  pruneIncompatibleSelection,
  ramKitLabel,
  ramQtySlotLimit,
  selectionPriceMkd,
  ssdIsNone,
  ssdQtySlotLimit,
  stepHasNone,
  withOptionalGpuSkipped,
  type CompatPart,
  type CompatSelection,
} from "@/lib/compatibility";
import { CheckoutModal } from "@/components/CheckoutModal";
import { FpsEstimatePanel } from "@/components/FpsEstimatePanel";
import { BottleneckPanel } from "@/components/BottleneckPanel";
import { rememberTrackingCode } from "@/components/LiveBuildPipeline";
import { useI18n } from "@/components/LanguageProvider";
import { useCurrency } from "@/components/CurrencyProvider";
import { PartFilters, type PartFilterState } from "@/components/PartFilters";
import { ProductImage } from "@/components/ProductImage";
import { inferListingGpuTdp } from "@/lib/listingPower";
import { selectionFromPrebuiltLabels, type PrebuiltPartLabels } from "@/lib/prebuiltEdit";
import { resolvePartImage } from "@/lib/partImages";
import { fetchSessionUser, loginUrl } from "@/lib/clientAuth";
import {
  clearBuilderDraft,
  consumeBuilderCheckoutPending,
  draftHasPicks,
  draftNeedsCatalog,
  getSavedBuild,
  hydrateSelection,
  loadBuilderDraft,
  markBuilderCheckoutPending,
  peekBuilderCheckoutPending,
  saveBuilderDraft,
  serializeSelection,
  upsertSavedBuild,
} from "@/lib/builderDraft";

type Part = CompatPart & {
  brand: string;
  priceMkd: number;
  stock: number;
  imageUrl?: string | null;
  includesCooler?: boolean | null;
  source?: "new" | "used";
  warrantyMonths?: number | null;
};

function isUsedPart(part: Part | CompatPart | null | undefined): boolean {
  return Boolean(part && String(part.id).startsWith("listing:"));
}

function partHasStock(part: Part | CompatPart): boolean {
  if (isNonePart(part) || isStockCoolerPart(part)) return true;
  return (part.stock ?? 0) > 0;
}

function listingIdFromPart(part: Part): string {
  return part.id.slice("listing:".length);
}

function partLabel(part: Part | CompatPart, usedBadge: string): string {
  if (isNonePart(part)) return part.name;
  if (isUsedPart(part)) return `${usedBadge} · ${part.name}`;
  return `${part.brand ?? ""} ${part.name}`.trim();
}

function warrantyMonthsOf(part: Part | CompatPart | null | undefined): number | null {
  if (!part || isNonePart(part) || isStockCoolerPart(part)) return null;
  const months = "warrantyMonths" in part ? part.warrantyMonths : null;
  if (isUsedPart(part)) return typeof months === "number" && months > 0 ? months : 3;
  return typeof months === "number" && months > 0 ? months : null;
}

const STEP_KEYS: Record<string, string> = {
  CPU: "builder.cpu",
  COOLER: "builder.cooler",
  MOTHERBOARD: "builder.motherboard",
  RAM: "builder.ram",
  GPU: "builder.gpu",
  PSU: "builder.psu",
  CASE: "builder.case",
  SSD: "builder.ssd",
};

const STEP_SHORT: Record<(typeof BUILDER_STEPS)[number], string> = {
  CPU: "CPU",
  COOLER: "COOLER",
  MOTHERBOARD: "MOTH",
  RAM: "RAM",
  GPU: "GPU",
  PSU: "PSU",
  CASE: "CASE",
  SSD: "SSD",
};

const DEFAULT_FILTERS: PartFilterState = {
  search: "",
  brand: "",
  ramType: "",
  sort: "price-asc",
  priceMin: 0,
  priceMax: 0,
};

const PHONE_PAGE_SIZE = 6;
const PC_PAGE_SIZE = 15;
const PAGE_BUTTONS = 6;

function usePcPartsLayout() {
  const [isPc, setIsPc] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsPc(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return isPc;
}

function visiblePageNumbers(current: number, total: number, max = PAGE_BUTTONS): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
  const half = Math.floor(max / 2);
  let start = Math.max(1, current - half);
  let end = start + max - 1;
  if (end > total) {
    end = total;
    start = Math.max(1, end - max + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function QuantityStepper({
  label,
  minusLabel,
  plusLabel,
  value,
  min,
  max,
  onChange,
  onLimit,
}: {
  label: string;
  minusLabel: string;
  plusLabel: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  onLimit?: () => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
      <button
        type="button"
        disabled={value <= min}
        aria-label={minusLabel}
        onClick={() => onChange(value - 1)}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-sm leading-none text-[var(--text)] transition enabled:hover:border-[var(--cyan)] enabled:hover:text-[var(--cyan)] disabled:cursor-not-allowed disabled:opacity-35"
      >
        −
      </button>
      <span className="min-w-4 text-center text-xs font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        disabled={value >= max && !onLimit}
        aria-label={plusLabel}
        onClick={() => {
          if (value >= max) {
            onLimit?.();
            return;
          }
          onChange(value + 1);
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-sm leading-none text-[var(--text)] transition enabled:hover:border-[var(--cyan)] enabled:hover:text-[var(--cyan)] disabled:cursor-not-allowed disabled:opacity-35"
      >
        +
      </button>
    </div>
  );
}

function RemoveItemButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[rgba(251,113,133,0.15)] hover:text-[var(--danger)]"
    >
      <span aria-hidden>✕</span>
    </button>
  );
}

function stepHasSelection(sel: CompatSelection, cat: keyof CompatSelection): boolean {
  if (cat === "SSD") return getSsds(sel).length > 0;
  return Boolean(sel[cat]);
}

function selectionHasChoice(sel: CompatSelection): boolean {
  return BUILDER_STEPS.some((cat) => {
    if (cat === "SSD") return Boolean(sel.SSD?.length);
    return Boolean(sel[cat]);
  });
}

export default function ConfiguratorPage() {
  const { t } = useI18n();
  const { formatPrice } = useCurrency();
  const router = useRouter();
  const [condition, setCondition] = useState<"new" | "used">("new");
  const [newParts, setNewParts] = useState<Part[]>([]);
  const [usedParts, setUsedParts] = useState<Part[]>([]);
  const [partsLoading, setPartsLoading] = useState(true);
  const [fee, setFee] = useState(ASSEMBLY_FEE_DEFAULT);
  const [step, setStep] = useState(0);
  const [selection, setSelection] = useState<CompatSelection>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [filters, setFilters] = useState<PartFilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const isPcLayout = usePcPartsLayout();
  const pageSize = isPcLayout ? PC_PAGE_SIZE : PHONE_PAGE_SIZE;
  const [ramQtyById, setRamQtyById] = useState<Record<string, number>>({});
  const [ssdQtyById, setSsdQtyById] = useState<Record<string, number>>({});
  const [slotWarning, setSlotWarning] = useState<string | null>(null);
  const [usedPartsReady, setUsedPartsReady] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [resumeCheckout, setResumeCheckout] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [activeSavedId, setActiveSavedId] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [cartBump, setCartBump] = useState(false);
  const [throwClones, setThrowClones] = useState<
    { id: number; src: string; x: number; y: number; w: number; h: number; dx: number; dy: number }[]
  >([]);
  const draftHydrated = useRef(false);
  const cartBtnRef = useRef<HTMLButtonElement>(null);
  const stepPanelRef = useRef<HTMLDivElement>(null);
  const skipStepScroll = useRef(true);
  const throwIdRef = useRef(0);
  const cartBumpTimer = useRef<number>(0);
  const autoNextTimer = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    setPartsLoading(true);
    fetch("/api/parts")
      .then(async (r) => {
        const text = await r.text();
        if (!text) throw new Error("Empty response");
        return JSON.parse(text) as { items?: Part[]; assemblyFeeMkd?: number };
      })
      .then((d) => {
        if (cancelled) return;
        setNewParts(
          (d.items ?? []).map((p: Part) => ({
            ...p,
            source: "new" as const,
          })),
        );
        setFee(d.assemblyFeeMkd ?? ASSEMBLY_FEE_DEFAULT);
      })
      .catch(() => {
        if (!cancelled) setNewParts([]);
      })
      .finally(() => {
        if (!cancelled) setPartsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sell?partsOnly=1")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const items = (d.items ?? [])
          .filter((l: { category: string }) =>
            (BUILDER_STEPS as readonly string[]).includes(l.category),
          )
          .map(
            (l: {
              id: string;
              name: string;
              category: string;
              priceMkd: number;
              imageUrl: string | null;
              sellerName: string;
            }) =>
              ({
                id: `listing:${l.id}`,
                name: l.name,
                brand: l.category === "GPU" ? "Used" : l.sellerName || "Used",
                category: l.category,
                priceMkd: l.priceMkd,
                stock: 1,
                imageUrl: l.imageUrl,
                socket: null,
                ramType: null,
                wattage: null,
                tdpWatts: l.category === "GPU" ? inferListingGpuTdp(l.name) : null,
                formFactor: null,
                source: "used" as const,
                warrantyMonths: 3,
              }) satisfies Part,
          );
        setUsedParts(items);
      })
      .catch(() => {
        if (!cancelled) setUsedParts([]);
      })
      .finally(() => {
        if (!cancelled) setUsedPartsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (draftHydrated.current || partsLoading || !usedPartsReady) return;
    const editSlug =
      typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.search).get("edit")?.trim() ?? "";
    if (editSlug && newParts.length > 0) {
      draftHydrated.current = true;
      let cancelled = false;
      fetch("/api/prebuilts")
        .then((r) => r.json())
        .then((data: { items?: (PrebuiltPartLabels & { slug: string; name: string })[] }) => {
          if (cancelled) return;
          const pc = (data.items ?? []).find((item) => item.slug === editSlug);
          if (pc) {
            const matched = selectionFromPrebuiltLabels(newParts, pc);
            setCondition("new");
            setStep(0);
            setSelection(matched.selection);
            setRamQtyById(matched.ramQtyById);
            setSsdQtyById({});
            setEditingName(pc.name);
          }
          window.history.replaceState(null, "", "/configurator");
          setDraftReady(true);
        })
        .catch(() => {
          if (!cancelled) setDraftReady(true);
        });
      return () => {
        cancelled = true;
      };
    }
    const savedId =
      typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.search).get("draft")?.trim() ?? "";
    if (savedId) {
      const saved = getSavedBuild(savedId);
      if (saved && draftNeedsCatalog(saved.ids) && newParts.length === 0 && usedParts.length === 0) {
        return;
      }
      draftHydrated.current = true;
      if (saved) {
        const catalog = [...newParts, ...usedParts];
        setCondition(saved.condition);
        setStep(Math.max(0, Math.min(BUILDER_STEPS.length - 1, saved.step)));
        setSelection(hydrateSelection(saved.ids, catalog));
        setRamQtyById(saved.ramQtyById);
        setSsdQtyById(saved.ssdQtyById);
        setActiveSavedId(saved.id);
      }
      window.history.replaceState(null, "", "/configurator");
      setDraftReady(true);
      return;
    }
    const draft = loadBuilderDraft();
    if (draft && draftNeedsCatalog(draft.ids) && newParts.length === 0 && usedParts.length === 0) {
      return;
    }
    draftHydrated.current = true;
    if (draft) {
      const catalog = [...newParts, ...usedParts];
      const restored = hydrateSelection(draft.ids, catalog);
      setCondition(draft.condition);
      setStep(Math.max(0, Math.min(BUILDER_STEPS.length - 1, draft.step)));
      setSelection(restored);
      setRamQtyById(draft.ramQtyById);
      setSsdQtyById(draft.ssdQtyById);
      setResumeCheckout(peekBuilderCheckoutPending());
    }
    setDraftReady(true);
  }, [partsLoading, usedPartsReady, newParts, usedParts]);

  useEffect(() => {
    if (!draftReady) return;
    const ids = serializeSelection(selection);
    if (!draftHasPicks(ids) && draftHasPicks(loadBuilderDraft()?.ids)) return;
    saveBuilderDraft({
      condition,
      step,
      ids,
      ramQtyById,
      ssdQtyById,
    });
  }, [draftReady, condition, step, selection, ramQtyById, ssdQtyById]);

  const parts = condition === "new" ? newParts : usedParts;
  const currentCat = BUILDER_STEPS[step] as keyof CompatSelection;
  const selectedSsds = getSsds(selection);

  const compatibleOptions = useMemo(
    () =>
      filterCompatibleParts(
        parts,
        currentCat,
        selection,
      ) as Part[],
    [parts, currentCat, selection],
  );

  const priceBounds = useMemo(() => {
    if (!compatibleOptions.length) return { min: 0, max: 0 };
    const prices = compatibleOptions.map((p) => p.priceMkd);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [compatibleOptions]);

  useEffect(() => {
    setFilters((prev) => ({
      search: "",
      brand: "",
      ramType: "",
      sort: prev.sort,
      priceMin: priceBounds.min,
      priceMax: priceBounds.max,
    }));
    setPage(1);
  }, [currentCat, condition, priceBounds.min, priceBounds.max]);

  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.brand, filters.sort, filters.priceMin, filters.priceMax]);

  const brands = useMemo(() => {
    const set = new Set(compatibleOptions.map((p) => p.brand));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [compatibleOptions]);

  const options = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const priceReady = priceBounds.max > 0 || compatibleOptions.length === 0;
    let list = compatibleOptions.filter((p) => {
      if (filters.brand && p.brand !== filters.brand) return false;
      if (
        priceReady &&
        (p.priceMkd < filters.priceMin || p.priceMkd > filters.priceMax)
      ) {
        return false;
      }
      if (q) {
        const hay = `${p.brand} ${p.name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      const aStock = isStockCoolerPart(a) ? 0 : 1;
      const bStock = isStockCoolerPart(b) ? 0 : 1;
      if (aStock !== bStock) return aStock - bStock;
      if (filters.sort === "name") {
        return `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`);
      }
      if (filters.sort === "price-desc") return b.priceMkd - a.priceMkd;
      return a.priceMkd - b.priceMkd;
    });

    return list;
  }, [compatibleOptions, filters, priceBounds.max, priceBounds.min]);

  const totalPages = Math.max(1, Math.ceil(options.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedOptions = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return options.slice(start, start + pageSize);
  }, [options, safePage, pageSize]);

  const filterHint = compatibilityFilterHint(selection, currentCat);
  const totalInCategory = parts.filter((p) => p.category === currentCat).length;

  const selectedMb =
    selection.MOTHERBOARD && !isNonePart(selection.MOTHERBOARD)
      ? selection.MOTHERBOARD
      : null;
  const selectedRam =
    selection.RAM && !isNonePart(selection.RAM) ? (selection.RAM as Part) : null;
  const selectedSsd = selectedSsds[0] ?? null;
  const ramSlotCount = motherboardRamSlots(selectedMb);
  const ssdSlotCount = motherboardSsdSlots(selectedMb);

  function ramQtyFor(part: Part | CompatPart): number {
    return clampRamQty(
      ramQtyById[part.id] ?? defaultRamQty(part),
      part.stock,
      ramQtySlotLimit(selectedMb, part),
    );
  }

  function ssdQtyFor(part: Part | CompatPart): number {
    return clampSsdQty(
      ssdQtyById[part.id] ?? defaultSsdQty(part),
      part.stock,
      ssdQtySlotLimit(selectedMb),
    );
  }

  function trySetRamQty(part: Part | CompatPart, qty: number) {
    const slotMax = ramQtySlotLimit(selectedMb, part);
    if (qty > slotMax) {
      setSlotWarning(
        t("builder.mbRamSlots", { count: ramSlotCount ?? slotMax }),
      );
      return;
    }
    setSlotWarning(null);
    setRamQtyById((s) => ({
      ...s,
      [part.id]: clampRamQty(qty, part.stock, slotMax),
    }));
  }

  function trySetSsdQty(part: Part | CompatPart, qty: number) {
    const slotMax = ssdQtySlotLimit(selectedMb);
    if (qty > slotMax) {
      setSlotWarning(
        t("builder.mbSsdSlots", { count: ssdSlotCount ?? slotMax }),
      );
      return;
    }
    setSlotWarning(null);
    setSsdQtyById((s) => ({
      ...s,
      [part.id]: clampSsdQty(qty, part.stock, slotMax),
    }));
  }

  const selectedRamQty = selectedRam ? ramQtyFor(selectedRam) : 1;
  const selectedSsdQty = selectedSsd ? ssdQtyFor(selectedSsd) : 1;

  useEffect(() => {
    if (selectedRam) {
      const limit = ramQtySlotLimit(selectedMb, selectedRam);
      const current = ramQtyById[selectedRam.id] ?? defaultRamQty(selectedRam);
      if (current > limit) {
        setRamQtyById((s) => ({ ...s, [selectedRam.id]: limit }));
        setSlotWarning(t("builder.mbRamSlots", { count: ramSlotCount ?? limit }));
      }
    }
    if (selectedSsd) {
      const limit = ssdQtySlotLimit(selectedMb);
      const current = ssdQtyById[selectedSsd.id] ?? defaultSsdQty(selectedSsd);
      if (current > limit) {
        setSsdQtyById((s) => ({ ...s, [selectedSsd.id]: limit }));
        setSlotWarning(t("builder.mbSsdSlots", { count: ssdSlotCount ?? limit }));
      }
    }
    // Re-check only when the motherboard changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMb?.id]);

  const issues = useMemo(
    () => checkCompatibility(selection, { ramQty: selectedRamQty, ssdQty: selectedSsdQty }),
    [selection, selectedRamQty, selectedSsdQty],
  );
  const blocked = hasBlockingErrors(issues);

  const partsCost = useMemo(
    () => selectionPriceMkd(selection, selectedRamQty, selectedSsdQty),
    [selection, selectedRamQty, selectedSsdQty],
  );
  const total = partsCost + fee;
  const power = useMemo(
    () =>
      estimatedPowerBreakdown(selection, {
        ramQty: selectedRamQty,
        ssdQty: selectedSsdQty,
      }),
    [selection, selectedRamQty, selectedSsdQty],
  );
  const usageWatts = power.total;
  const selectedPsuWattage =
    selection.PSU && !isNonePart(selection.PSU) ? selection.PSU.wattage ?? null : null;
  const realParts = useMemo(() => flattenSelection(selection), [selection]);
  const warrantyRows = useMemo(() => {
    const rows: { category: string; months: number | null; included: boolean }[] = [];
    for (const cat of BUILDER_STEPS) {
      const key = cat as keyof CompatSelection;
      const picked = key === "SSD" ? getSsds(selection) : selection[key] ? [selection[key]] : [];
      for (const part of picked) {
        if (!part || isNonePart(part)) continue;
        rows.push({
          category: cat,
          months: warrantyMonthsOf(part),
          included: isStockCoolerPart(part),
        });
      }
    }
    return rows;
  }, [selection]);
  const shortestWarranty = warrantyRows.reduce<number | null>((shortest, row) => {
    if (row.months == null) return shortest;
    return shortest == null ? row.months : Math.min(shortest, row.months);
  }, null);
  const selectedCount = realParts.length;
  const hasOutOfStockPick = realParts.some((p) => {
    if (p.category === "RAM") return (p.stock ?? 0) < ramQtyFor(p);
    if (p.category === "SSD") return (p.stock ?? 0) < ssdQtyFor(p);
    return !partHasStock(p);
  });
  const requiredReady =
    BUILDER_STEPS.every((c) => isStepComplete(selection, c as keyof CompatSelection)) &&
    realParts.length >= 1 &&
    !hasOutOfStockPick;

  useEffect(() => {
    if (!draftReady || !resumeCheckout) return;
    let cancelled = false;
    fetchSessionUser().then((user) => {
      if (cancelled) return;
      if (!user) return;
      if (requiredReady && !blocked) {
        setCheckoutOpen(true);
      }
      consumeBuilderCheckoutPending();
      setResumeCheckout(false);
    });
    return () => {
      cancelled = true;
    };
  }, [draftReady, resumeCheckout, requiredReady, blocked]);

  useEffect(() => {
    if (!pricingOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPricingOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [pricingOpen]);

  useEffect(() => {
    return () => {
      window.clearTimeout(cartBumpTimer.current);
      window.clearTimeout(autoNextTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    if (skipStepScroll.current) {
      skipStepScroll.current = false;
      return;
    }
    const id = window.requestAnimationFrame(() => {
      scrollBuilderToTop();
    });
    return () => window.cancelAnimationFrame(id);
  }, [step, draftReady]);

  function scrollBuilderToTop() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = stepPanelRef.current;
    if (el) {
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    }
  }

  function goToPage(next: number) {
    setPage(next);
    window.requestAnimationFrame(() => {
      scrollBuilderToTop();
    });
  }

  function persistDraftNow(sel: CompatSelection = selection) {
    saveBuilderDraft({
      condition,
      step,
      ids: serializeSelection(sel),
      ramQtyById,
      ssdQtyById,
    });
  }

  async function requireLoginForBuy(sel: CompatSelection = selection) {
    persistDraftNow(sel);
    const user = await fetchSessionUser();
    if (user) return true;
    markBuilderCheckoutPending();
    router.push(loginUrl("/configurator"));
    return false;
  }

  function canBuySelection(sel: CompatSelection): boolean {
    const ram = sel.RAM && !isNonePart(sel.RAM) ? sel.RAM : null;
    const ssds = getSsds(sel);
    const ramQty = ram ? ramQtyFor(ram) : 1;
    const ssdQty = ssds[0] ? ssdQtyFor(ssds[0]) : 1;
    if (hasBlockingErrors(checkCompatibility(sel, { ramQty, ssdQty }))) return false;
    const parts = flattenSelection(sel);
    if (parts.length < 1) return false;
    if (!BUILDER_STEPS.every((c) => isStepComplete(sel, c as keyof CompatSelection))) {
      return false;
    }
    return !parts.some((p) => {
      if (p.category === "RAM") return (p.stock ?? 0) < ramQtyFor(p);
      if (p.category === "SSD") return (p.stock ?? 0) < ssdQtyFor(p);
      return !partHasStock(p);
    });
  }

  async function beginBuy(sel: CompatSelection = selection) {
    const ready = withOptionalGpuSkipped(sel);
    if (ready !== sel) setSelection(ready);
    if (!canBuySelection(ready)) return;
    if (!(await requireLoginForBuy(ready))) return;
    setPricingOpen(false);
    setCheckoutOpen(true);
  }

  function isPartActive(part: Part): boolean {
    if (currentCat === "SSD") {
      return selectedSsds.some((s) => s.id === part.id);
    }
    const cur = selection[currentCat];
    return Boolean(cur && !Array.isArray(cur) && cur.id === part.id);
  }

  /** Mark an optional step as skipped when Next is used with nothing chosen. */
  function ensureStepChoice(sel: CompatSelection): CompatSelection {
    if (currentCat === "CPU" || currentCat === "MOTHERBOARD" || currentCat === "CASE") {
      return sel;
    }
    if (stepHasNone(sel, currentCat)) return sel;
    if (currentCat === "SSD") {
      if (getSsds(sel).length > 0) return sel;
      return { ...sel, SSD: [createNonePart("SSD")] };
    }
    const current = sel[currentCat];
    if (current && !Array.isArray(current)) return sel;
    return pruneIncompatibleSelection(
      { ...sel, [currentCat]: createNonePart(currentCat) } as CompatSelection,
      currentCat,
    );
  }

  function removeCategory(cat: keyof CompatSelection) {
    window.clearTimeout(autoNextTimer.current);
    setSlotWarning(null);
    if (cat === "PSU") setStep(BUILDER_STEPS.indexOf("PSU"));
    setSelection((s) => {
      const next: CompatSelection =
        cat === "SSD" ? { ...s, SSD: null } : { ...s, [cat]: null };
      let pruned = pruneIncompatibleSelection(next, cat);
      if (cat === "CPU" && pruned.COOLER && isStockCoolerPart(pruned.COOLER)) {
        pruned = { ...pruned, COOLER: null };
      }
      return pruned;
    });
  }

  function clearAll() {
    window.clearTimeout(autoNextTimer.current);
    setSelection({});
    setRamQtyById({});
    setSsdQtyById({});
    setSlotWarning(null);
    setCondition("new");
    setStep(0);
    setActiveSavedId("");
    setEditingName("");
    clearBuilderDraft();
  }

  function saveCurrentBuild() {
    const ids = serializeSelection(selection);
    if (!draftHasPicks(ids)) return;
    const lines = BUILDER_STEPS.flatMap((cat) => {
      const picked =
        cat === "SSD" ? (selection.SSD ?? []) : selection[cat] ? [selection[cat]] : [];
      return picked
        .filter((part): part is Part => Boolean(part))
        .map((part) => ({
          category: cat,
          label: partLabel(part, t("builder.usedBadge")),
        }));
    });
    const cpu = lines.find((line) => line.category === "CPU")?.label;
    const id = activeSavedId || `saved-${Date.now()}`;
    const existing = activeSavedId ? getSavedBuild(activeSavedId) : null;
    const name = editingName.trim() || existing?.name || cpu || t("saved.defaultName");
    upsertSavedBuild({
      id,
      name,
      savedAt: Date.now(),
      condition,
      step,
      ids,
      ramQtyById,
      ssdQtyById,
      lines,
    });
    setActiveSavedId(id);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  }

  function conditionForStep(index: number, current: "new" | "used"): "new" | "used" {
    if (current !== "used") return "new";
    const cat = BUILDER_STEPS[index];
    return usedParts.some((p) => p.category === cat) ? "used" : "new";
  }

  function goPrev() {
    window.clearTimeout(autoNextTimer.current);
    if (step > 0) {
      const next = step - 1;
      setCondition((c) => conditionForStep(next, c));
      setStep(next);
    }
  }

  function goNext() {
    window.clearTimeout(autoNextTimer.current);
    setSelection((s) => ensureStepChoice(s));
    if (step < BUILDER_STEPS.length - 1) {
      const next = step + 1;
      setCondition((c) => conditionForStep(next, c));
      setStep(next);
    }
  }

  function jumpToStep(i: number) {
    window.clearTimeout(autoNextTimer.current);
    setCondition((c) => conditionForStep(i, c));
    setStep(i);
  }

  function goNextAfterPick() {
    if (step >= BUILDER_STEPS.length - 1) return;
    window.clearTimeout(autoNextTimer.current);
    const next = step + 1;
    autoNextTimer.current = window.setTimeout(() => {
      setCondition((c) => conditionForStep(next, c));
      setStep(next);
    }, 280);
  }

  function goNextOrBuy() {
    if (!isLastStep) {
      goNext();
      return;
    }
    const nextSel = withOptionalGpuSkipped(ensureStepChoice(selection));
    setSelection(nextSel);
    const phone = window.matchMedia("(max-width: 1023px)").matches;
    if (phone) {
      if (!canBuySelection(nextSel)) return;
      setPricingOpen(true);
      return;
    }
    void beginBuy(nextSel);
  }

  function throwToCart(sourceEl: HTMLElement, src: string) {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCartBump(true);
      window.clearTimeout(cartBumpTimer.current);
      cartBumpTimer.current = window.setTimeout(() => setCartBump(false), 400);
      return;
    }
    const cart = cartBtnRef.current;
    if (!cart) return;
    const cartRect = cart.getBoundingClientRect();
    if (cartRect.width < 8) return;
    const from = sourceEl.getBoundingClientRect();
    const id = ++throwIdRef.current;
    setThrowClones((list) => [
      ...list,
      {
        id,
        src,
        x: from.left,
        y: from.top,
        w: from.width,
        h: from.height,
        dx: cartRect.left + cartRect.width / 2 - (from.left + from.width / 2),
        dy: cartRect.top + cartRect.height / 2 - (from.top + from.height / 2),
      },
    ]);
  }

  function finishThrow(id: number) {
    setThrowClones((list) => list.filter((item) => item.id !== id));
    setCartBump(true);
    window.clearTimeout(cartBumpTimer.current);
    cartBumpTimer.current = window.setTimeout(() => setCartBump(false), 400);
  }

  function pick(part: Part, sourceEl?: HTMLElement) {
    const outOfStock = !partHasStock(part);
    const alreadyOn = isPartActive(part);
    if (outOfStock && !alreadyOn) return;

    const adding = !alreadyOn;

    if (adding && sourceEl) {
      const img = sourceEl.querySelector("img");
      throwToCart(img ?? sourceEl, resolvePartImage(part));
    }

    // Toggle deselect when clicking the same part again
    if (currentCat === "SSD") {
      if (ssdIsNone(selection) || !alreadyOn) {
        setSsdQtyById((s) => ({
          ...s,
          [part.id]: s[part.id] ?? defaultSsdQty(part),
        }));
        setSlotWarning(null);
        setSelection((s) => ({ ...s, SSD: [part] }));
        return;
      }
      setSelection((s) => ({ ...s, SSD: null }));
      return;
    }

    const current = selection[currentCat];
    if (current && !Array.isArray(current) && current.id === part.id) {
      setSelection((s) => ({ ...s, [currentCat]: null }));
      return;
    }

    if (currentCat === "RAM") {
      setRamQtyById((s) => ({
        ...s,
        [part.id]: s[part.id] ?? defaultRamQty(part),
      }));
    }

    setSelection((s) => {
      const withPick = { ...s, [currentCat]: part } as CompatSelection;
      let pruned = pruneIncompatibleSelection(withPick, currentCat);

      if (currentCat === "CPU") {
        if (
          pruned.COOLER &&
          isStockCoolerPart(pruned.COOLER) &&
          cpuNeedsCooler(pruned.CPU)
        ) {
          pruned.COOLER = null;
        }
        if (
          pruned.CPU &&
          !isNonePart(pruned.CPU) &&
          !cpuNeedsCooler(pruned.CPU) &&
          (!pruned.COOLER || isNonePart(pruned.COOLER))
        ) {
          const stock = parts.find(
            (p) => p.category === "COOLER" && isStockCoolerPart(p) && p.stock > 0,
          );
          if (stock) pruned = { ...pruned, COOLER: stock };
        }
      }
      return pruned;
    });
    goNextAfterPick();
  }

  const selectedGpu =
    selection.GPU && !isNonePart(selection.GPU) ? (selection.GPU as Part) : null;
  const selectedCpu =
    selection.CPU && !isNonePart(selection.CPU) ? (selection.CPU as Part) : null;
  const selectedCooler =
    selection.COOLER && !isNonePart(selection.COOLER) ? selection.COOLER : null;
  const needsToRun = (
    [
      !selectedRam ? "ram" : null,
      selectedGpu || cpuHasIntegratedGraphics(selectedCpu) ? null : "gpu",
      !hasRealPsu(selection) ? "psu" : null,
      cpuNeedsCooler(selectedCpu) && !selectedCooler ? "cooler" : null,
      !selectedSsd ? "ssd" : null,
    ] as const
  ).filter((item): item is "ram" | "gpu" | "ssd" | "psu" | "cooler" => item !== null);
  const bringOwnKey = {
    ram: "builder.bringOwnRam",
    gpu: "builder.bringOwnGpu",
    psu: "builder.bringOwnPsu",
    cooler: "builder.bringOwnCooler",
    ssd: "builder.bringOwnSsd",
  } as const;
  const bringOwnStep = {
    ram: "RAM",
    gpu: "GPU",
    psu: "PSU",
    cooler: "COOLER",
    ssd: "SSD",
  } as const;
  const coreReady =
    isStepComplete(selection, "CPU") &&
    isStepComplete(selection, "MOTHERBOARD") &&
    isStepComplete(selection, "CASE");
  const bringOwnNotes = needsToRun
    .filter((item) => {
      const cat = bringOwnStep[item];
      const idx = BUILDER_STEPS.indexOf(cat);
      return (
        coreReady ||
        step > idx ||
        stepHasNone(selection, cat) ||
        (item === "ssd" && ssdIsNone(selection))
      );
    })
    .map((item) => bringOwnKey[item]);
  const isFirstStep = step <= 0;
  const isLastStep = step >= BUILDER_STEPS.length - 1;
  const canClear = selectionHasChoice(selection);
  const nextDisabled = isLastStep && !canBuySelection(ensureStepChoice(selection));

  async function submitOrder(data: {
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    customerAddress: string;
    city: string;
  }) {
    const selected = flattenSelection(selection) as Part[];
    const partIds: string[] = [];
    const listingIds: string[] = [];
    for (const p of selected) {
      if (isUsedPart(p)) {
        listingIds.push(listingIdFromPart(p));
        continue;
      }
      const times =
        p.category === "RAM" ? ramQtyFor(p) : p.category === "SSD" ? ssdQtyFor(p) : 1;
      for (let i = 0; i < times; i++) partIds.push(p.id);
    }
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "CUSTOM",
        partIds,
        listingIds,
        selfBuild: false,
        ...data,
      }),
    });
    const json = await res.json();
    if (res.status === 401) {
      persistDraftNow();
      markBuilderCheckoutPending();
      router.push(loginUrl("/configurator"));
      throw new Error(json.error || "Login required");
    }
    if (!res.ok) throw new Error(json.error || "Error");
    rememberTrackingCode(json.order.trackingCode, {
      status: json.order.status,
      type: "CUSTOM",
      label: "Custom Build",
      totalMkd: json.order.totalMkd,
    });
    clearBuilderDraft();
    setCheckoutOpen(false);
    router.push(`/orders/${json.order.trackingCode}`);
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 pb-52 md:px-6 lg:pb-10">
      <div className="mb-8">
        <h1 className="section-title text-3xl md:text-4xl">{t("builder.title")}</h1>
        <p className="mt-2 text-[var(--text-muted)]">{t("builder.desc")}</p>
        {editingName ? (
          <p className="mt-2 text-sm text-[var(--cyan)]">
            {t("builder.editingPrebuilt", { name: editingName })}
          </p>
        ) : null}
      </div>

      <div className="mb-6 hidden flex-wrap gap-2 lg:flex">
        {BUILDER_STEPS.map((cat, i) => {
          const filled = stepHasSelection(selection, cat as keyof CompatSelection);
          return (
            <button
              key={cat}
              onClick={() => jumpToStep(i)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                i === step
                  ? "bg-[var(--cyan)] text-[#041018]"
                  : filled
                    ? "bg-[rgba(52,211,153,0.15)] text-[var(--mint)]"
                    : "bg-[rgba(34,211,238,0.06)] text-[var(--text-muted)]"
              }`}
            >
              {i + 1}. {t(STEP_KEYS[cat])}
              {cat === "SSD" && selectedSsd && selectedSsdQty > 1 ? ` ×${selectedSsdQty}` : ""}
              {cat === "RAM" && selectedRam && selectedRamQty > 1 ? ` ×${selectedRamQty}` : ""}
              {stepHasNone(selection, cat as keyof CompatSelection)
                ? ` · ${t("builder.none")}`
                : ""}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)_190px]">
        <aside className="order-3 space-y-4 lg:order-1 lg:sticky lg:top-20 lg:self-start">
          <div
            id="builder-pricing"
            className={
              pricingOpen
                ? "fixed inset-x-0 bottom-0 z-[90] max-h-[85vh] overflow-y-auto p-4 lg:static lg:z-auto lg:max-h-none lg:overflow-visible lg:p-0"
                : "hidden lg:block"
            }
          >
          <div className="glass-strong rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="section-title text-xl">{t("builder.pricing")}</h3>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPricingOpen(false)}
                  className="rounded-lg px-2.5 py-1.5 text-sm text-[var(--text-muted)] lg:hidden"
                  aria-label={t("prebuilts.close")}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              {BUILDER_STEPS.map((cat) => {
                const key = cat as keyof CompatSelection;
                const removeLabel = t("builder.removeItem", { part: t(STEP_KEYS[cat]) });
                if (key === "SSD") {
                  if (!selectedSsd) {
                    const skipped = ssdIsNone(selection);
                    return (
                      <div key={cat} className="flex items-center justify-between gap-2">
                        <span className="text-[var(--text-muted)]">
                          {t(STEP_KEYS[cat])}
                          {skipped ? (
                            <span className="text-[var(--text)]"> · {t("builder.none")}</span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-0.5">
                          <span className="tabular-nums">{skipped ? formatPrice(0) : "—"}</span>
                          {skipped ? (
                            <RemoveItemButton
                              label={removeLabel}
                              onClick={() => removeCategory("SSD")}
                            />
                          ) : null}
                        </span>
                      </div>
                    );
                  }
                  const ssd = selectedSsd;
                  const ssdQty = ssdQtyFor(ssd);
                  return (
                    <div key={cat} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[var(--text-muted)]">
                        {t(STEP_KEYS[cat])}
                        {ssdQty > 1 ? ` ×${ssdQty}` : ""}
                        <span className="text-[var(--text)]">
                          {" "}
                          · {partLabel(ssd, t("builder.usedBadge"))}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5">
                        <span className="tabular-nums">
                          {formatPrice((ssd.priceMkd ?? 0) * ssdQty)}
                        </span>
                        <RemoveItemButton
                          label={removeLabel}
                          onClick={() => removeCategory("SSD")}
                        />
                      </span>
                    </div>
                  );
                }
                const p = selection[key] as Part | null | undefined;
                const ramQty = key === "RAM" && p && !isNonePart(p) ? ramQtyFor(p) : 1;
                return (
                  <div key={cat} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[var(--text-muted)]">
                      {t(STEP_KEYS[cat])}
                      {ramQty > 1 ? ` ×${ramQty}` : ""}
                      {p ? (
                        <span className="text-[var(--text)]">
                          {" "}
                          ·{" "}
                          {isNonePart(p)
                            ? t("builder.none")
                            : partLabel(p, t("builder.usedBadge"))}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      <span className="tabular-nums">
                        {p
                          ? isNonePart(p)
                            ? formatPrice(0)
                            : formatPrice((p.priceMkd ?? 0) * ramQty)
                          : "—"}
                      </span>
                      {p ? (
                        <RemoveItemButton
                          label={removeLabel}
                          onClick={() => removeCategory(key)}
                        />
                      ) : null}
                    </span>
                  </div>
                );
              })}
              <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-3">
                <span className="text-[var(--text-muted)]">{t("home.assemblyFee")}</span>
                <span className="shrink-0 tabular-nums text-[var(--mint)]">
                  +{formatPrice(fee)}
                </span>
              </div>
              <div className="flex justify-between border-t border-[var(--border)] pt-3 text-base font-semibold">
                <span>{t("home.totalPrice")}</span>
                <span className="text-[var(--cyan)]">{formatPrice(total)}</span>
              </div>
              {warrantyRows.length > 0 && (
                <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">{t("builder.warranty")}</span>
                    <span className="shrink-0 font-semibold text-[var(--mint)]">
                      {shortestWarranty != null
                        ? t("builder.warrantyMonths", { months: shortestWarranty })
                        : "—"}
                    </span>
                  </div>
                  {warrantyRows.map((row) => (
                    <div key={row.category} className="flex justify-between gap-2 pl-2 text-[11px]">
                      <span className="text-[var(--text-muted)]">{t(STEP_KEYS[row.category])}</span>
                      <span
                        className={`shrink-0 ${
                          row.months != null ? "text-[var(--mint)]" : "text-[var(--text-muted)]"
                        }`}
                      >
                        {row.included
                          ? t("builder.warrantyIncluded")
                          : row.months != null
                            ? t("builder.warrantyMonths", { months: row.months })
                            : t("builder.warrantyUnknown")}
                      </span>
                    </div>
                  ))}
                  <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                    {t("builder.warrantyHint")}
                  </p>
                </div>
              )}
              <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--text-muted)]">{t("builder.powerUsage")}</span>
                  <span
                    className={`shrink-0 tabular-nums font-semibold ${
                      usageWatts > 0 ? "text-[var(--cyan)]" : "text-[var(--text-muted)]"
                    }`}
                  >
                    {usageWatts > 0 ? t("builder.powerWatts", { watts: usageWatts }) : "—"}
                  </span>
                </div>
                {power.lines.map((line) => (
                  <div
                    key={line.category}
                    className="flex justify-between gap-2 pl-2 text-[11px]"
                  >
                    <span className="min-w-0 truncate text-[var(--text-muted)]">
                      {t(STEP_KEYS[line.category])}
                      {line.qty && line.qty > 1 ? ` ×${line.qty}` : ""}
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--text)]">
                      {t("builder.powerWatts", { watts: line.watts })}
                    </span>
                  </div>
                ))}
                {selectedPsuWattage ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">{t("builder.powerPsu")}</span>
                    <span
                      className={`shrink-0 tabular-nums ${
                        usageWatts > 0 && selectedPsuWattage < usageWatts
                          ? "text-[var(--danger)]"
                          : usageWatts > 0 && selectedPsuWattage < usageWatts + 100
                            ? "text-[var(--warn)]"
                            : "text-[var(--mint)]"
                      }`}
                    >
                      {t("builder.powerWatts", { watts: selectedPsuWattage })}
                    </span>
                  </div>
                ) : null}
                <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                  {t("builder.powerHint")}
                </p>
              </div>
              <p className="text-xs text-[var(--text-muted)]">{t("builder.cod")}</p>
            </div>
            {!coreReady ? (
              <p className="mt-3 text-xs text-[var(--warn)]">{t("builder.coreRequired")}</p>
            ) : needsToRun.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-[var(--warn)]">
                {needsToRun.includes("ram") ? <li>{t("checkout.needsRam")}</li> : null}
                {needsToRun.includes("gpu") ? <li>{t("checkout.needsGpu")}</li> : null}
                {needsToRun.includes("psu") ? <li>{t("checkout.needsPsu")}</li> : null}
                {needsToRun.includes("cooler") ? <li>{t("checkout.needsCooler")}</li> : null}
                {needsToRun.includes("ssd") ? <li>{t("checkout.needsSsd")}</li> : null}
              </ul>
            ) : null}
            <button
              disabled={!requiredReady || blocked}
              onClick={() => {
                void beginBuy();
              }}
              className="btn btn-primary mt-4 w-full"
            >
              {t("builder.order")}
            </button>
          </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <h3 className="section-title text-lg">{t("builder.compatibility")}</h3>
            {issues.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--mint)]">
                {selectedCount < 2 ? t("builder.pickMore") : t("builder.noConflicts")}
              </p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {issues.map((issue, i) => (
                  <li
                    key={i}
                    className={
                      issue.severity === "error" ? "text-[var(--danger)]" : "text-[var(--warn)]"
                    }
                  >
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
            {bringOwnNotes.length > 0 && (
              <ul className="mt-2 space-y-2 text-sm text-[var(--warn)]">
                {bringOwnNotes.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            )}
            {slotWarning && (
              <p className="mt-2 text-sm font-medium text-[var(--warn)]">{slotWarning}</p>
            )}
          </div>

          <BottleneckPanel
            gpuName={selectedGpu ? `${selectedGpu.brand} ${selectedGpu.name}` : null}
            cpuName={selectedCpu ? `${selectedCpu.brand} ${selectedCpu.name}` : null}
          />

          <FpsEstimatePanel
            gpuName={selectedGpu ? `${selectedGpu.brand} ${selectedGpu.name}` : null}
            cpuName={selectedCpu ? `${selectedCpu.brand} ${selectedCpu.name}` : null}
          />
        </aside>

        <div ref={stepPanelRef} className="order-2 scroll-mt-20 glass rounded-2xl p-4 lg:order-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="section-title text-xl">
                {t(STEP_KEYS[currentCat])}{" "}
                <span className="text-[var(--text-muted)]">/ {currentCat}</span>
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {t("builder.stepOf", { step: step + 1, total: BUILDER_STEPS.length })}
              </p>
            </div>
            <div className="hidden shrink-0 items-center gap-2 lg:flex">
              <button
                type="button"
                onClick={saveCurrentBuild}
                disabled={!canClear}
                className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-sm font-medium text-[var(--cyan)] transition enabled:hover:border-[var(--cyan)] enabled:hover:bg-[rgba(34,211,238,0.1)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {savedFlash ? t("builder.saved") : t("builder.saveDraft")}
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={!canClear}
                className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-sm font-medium text-[var(--danger)] transition enabled:hover:border-[var(--danger)] enabled:hover:bg-[rgba(251,113,133,0.1)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {t("builder.clearAll")}
              </button>
              <button
                type="button"
                onClick={goPrev}
                disabled={isFirstStep}
                className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-sm font-medium text-[var(--text)] transition enabled:hover:border-[var(--cyan)] enabled:hover:text-[var(--cyan)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {t("builder.prev")}
              </button>
              <button
                type="button"
                onClick={goNextOrBuy}
                disabled={nextDisabled}
                className="rounded-lg bg-[var(--cyan)] px-3.5 py-2 text-sm font-medium text-[#041018] transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {isLastStep ? t("builder.order") : t("builder.next")}
              </button>
            </div>
          </div>

          {filterHint && (
            <p className="mt-2 text-xs text-[var(--mint)]">
              {t("builder.filteredBy", { filter: filterHint })} · {compatibleOptions.length}/
              {totalInCategory}
            </p>
          )}
          {currentCat === "COOLER" && selection.CPU && cpuNeedsCooler(selection.CPU) && (
            <p className="mt-2 text-xs text-[var(--warn)]">{t("builder.coolerRequiredHint")}</p>
          )}
          {(currentCat === "CPU" || currentCat === "MOTHERBOARD" || currentCat === "CASE") &&
            !isStepComplete(selection, currentCat) && (
              <p className="mt-2 text-xs text-[var(--warn)]">{t("builder.coreRequired")}</p>
            )}
          {currentCat === "COOLER" && selection.CPU && !cpuNeedsCooler(selection.CPU) && (
            <p className="mt-2 text-xs text-[var(--mint)]">{t("builder.coolerIncludedHint")}</p>
          )}
          {currentCat === "SSD" && ssdSlotCount ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {t("builder.ssdQtyHintSlots", { count: ssdSlotCount })}
            </p>
          ) : null}
          {currentCat === "RAM" && ramSlotCount ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {t("builder.ramQtyHintSlots", { count: ramSlotCount })}
            </p>
          ) : null}
          {slotWarning && (
            <p className="mt-2 text-xs font-medium text-[var(--warn)]">{slotWarning}</p>
          )}
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t("builder.clickToDeselect")}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t("builder.usedHint")}</p>
          <div className="mt-2.5 flex justify-center">
            <div className="inline-flex rounded-full border border-[var(--border)] bg-[rgba(7,11,18,0.55)] p-0.5">
              {(
                [
                  ["new", t("builder.conditionNew")],
                  ["used", t("builder.conditionUsed")],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCondition(id)}
                  className={`min-w-[7.25rem] rounded-full px-5 py-1.5 text-xs font-semibold tracking-wide transition ${
                    condition === id
                      ? "bg-[var(--cyan)] text-[#041018] shadow-[0_0_16px_rgba(34,211,238,0.28)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
            {pagedOptions.map((part) => {
              const active = isPartActive(part);
              const img = resolvePartImage(part);
              const outOfStock = !partHasStock(part);
              const qty =
                currentCat === "RAM"
                  ? ramQtyFor(part)
                  : currentCat === "SSD"
                    ? ssdQtyFor(part)
                    : 1;
              const stockMax =
                currentCat === "RAM"
                  ? clampRamQty(MAX_RAM_STICKS, part.stock)
                  : currentCat === "SSD"
                    ? clampSsdQty(MAX_SSD_QTY, part.stock)
                    : 1;
              const showQty = (currentCat === "RAM" || currentCat === "SSD") && !outOfStock && stockMax > 1;
              return (
                <div
                  key={part.id}
                  role="button"
                  tabIndex={outOfStock && !active ? -1 : 0}
                  aria-disabled={outOfStock && !active}
                  aria-pressed={active}
                  onClick={(e) => pick(part, e.currentTarget)}
                  onKeyDown={(e) => {
                    if (outOfStock && !active) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      pick(part, e.currentTarget);
                    }
                  }}
                  className={`group overflow-hidden rounded-lg border p-2 text-left transition ${
                    active
                      ? "border-[var(--cyan)] bg-[rgba(34,211,238,0.1)]"
                      : outOfStock
                        ? "cursor-not-allowed border-[var(--border)] bg-[rgba(7,11,18,0.4)] opacity-55"
                        : "cursor-pointer border-[var(--border)] bg-[rgba(7,11,18,0.4)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div className="relative mb-1.5">
                    <ProductImage
                      src={img}
                      alt={`${part.brand} ${part.name}`}
                      ratio="square"
                      className="!rounded-md [&_img]:!p-1"
                    />
                    {outOfStock && (
                      <span className="badge badge-out-of-stock absolute left-1 top-1 !px-1.5 !py-0.5 !text-[9px] uppercase tracking-wide">
                        {t("builder.noStock")}
                      </span>
                    )}
                    {condition === "used" && (
                      <span className="absolute left-1 top-1 rounded bg-[rgba(7,11,18,0.85)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--cyan)]">
                        {t("builder.usedBadge")}
                      </span>
                    )}
                    {active && showQty && qty > 1 && (
                      <span className="absolute right-1 bottom-1 rounded bg-[var(--cyan)] px-1.5 py-0.5 text-[9px] font-semibold text-[#041018]">
                        ×{qty}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[10px] text-[var(--cyan-dim)]">
                    {condition === "used"
                      ? part.category === "GPU"
                        ? t("builder.usedBadge")
                        : t("builder.sellerLabel", { name: part.brand })
                      : part.brand}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug">{part.name}</p>
                  {isStockCoolerPart(part) ? (
                    <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                      {t("builder.warrantyIncluded")}
                    </p>
                  ) : warrantyMonthsOf(part) != null ? (
                    <p className="mt-0.5 text-[10px] font-medium text-[var(--mint)]">
                      {t("builder.warrantyMonths", { months: warrantyMonthsOf(part) ?? 0 })}
                    </p>
                  ) : null}
                  {showQty && (
                    <div className="mt-1.5">
                      <QuantityStepper
                        label={t("builder.quantity")}
                        minusLabel={t("builder.qtyMinus")}
                        plusLabel={t("builder.qtyPlus")}
                        value={qty}
                        min={currentCat === "SSD" ? MIN_SSD_QTY : MIN_RAM_STICKS}
                        max={stockMax}
                        onChange={(n) =>
                          currentCat === "SSD" ? trySetSsdQty(part, n) : trySetRamQty(part, n)
                        }
                      />
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center justify-between gap-1">
                    <span className="text-xs font-medium text-[var(--cyan)]">
                      {showQty && qty > 1
                        ? `${formatPrice(part.priceMkd)} ×${qty}`
                        : formatPrice(part.priceMkd)}
                    </span>
                    <span className="truncate text-[10px] text-[var(--text-muted)]">
                      {[
                        part.socket,
                        part.ramType,
                        currentCat === "RAM" ? ramKitLabel(part.name) : null,
                        part.wattage ? `${part.wattage}W` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                </div>
              );
            })}
            {partsLoading && condition === "new" && (
              <p className="col-span-full text-sm text-[var(--text-muted)]">
                {t("builder.loadingParts")}
              </p>
            )}
            {!partsLoading && condition === "new" && !compatibleOptions.length && (
              <p className="col-span-full text-sm text-[var(--text-muted)]">
                {filterHint ? t("builder.noCompatParts") : t("builder.noParts")}
              </p>
            )}
            {condition === "used" && !compatibleOptions.length && (
              <p className="col-span-full text-sm text-[var(--text-muted)]">
                {t("builder.noUsedParts")}
              </p>
            )}
            {!partsLoading && compatibleOptions.length > 0 && !options.length && (
              <p className="col-span-full text-sm text-[var(--text-muted)]">
                {t("builder.filterNoMatch")}
              </p>
            )}
          </div>

          {options.length > pageSize && (
            <div className="mt-5 flex flex-nowrap items-center justify-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => goToPage(Math.max(1, safePage - 1))}
                className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-[var(--text-muted)] disabled:opacity-30 hover:text-[var(--text)]"
              >
                ‹
              </button>
              {visiblePageNumbers(safePage, totalPages).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => goToPage(n)}
                  className={`min-w-7 shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                    n === safePage
                      ? "bg-[var(--cyan)] text-[#041018]"
                      : "bg-[rgba(34,211,238,0.08)] text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => goToPage(Math.min(totalPages, safePage + 1))}
                className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-[var(--text-muted)] disabled:opacity-30 hover:text-[var(--text)]"
              >
                ›
              </button>
            </div>
          )}
        </div>

        <div className="order-1 lg:order-3 lg:sticky lg:top-20 lg:self-start">
          <PartFilters
            brands={brands}
            priceBounds={priceBounds}
            filters={filters}
            onChange={setFilters}
            resultCount={options.length}
          />
        </div>
      </div>

      {pricingOpen && (
        <button
          type="button"
          aria-label={t("prebuilts.close")}
          className="fixed inset-0 z-[85] bg-black/60 lg:hidden"
          onClick={() => setPricingOpen(false)}
        />
      )}

      {!pricingOpen && !checkoutOpen && (
        <nav
          aria-label={t("builder.stepOf", { step: step + 1, total: BUILDER_STEPS.length })}
          className="fixed inset-x-0 bottom-0 z-[55] border-t border-[var(--border)] bg-[rgba(7,11,18,0.94)] px-2 pt-1.5 backdrop-blur-xl lg:hidden"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-[1600px] gap-0.5">
            {BUILDER_STEPS.map((cat, i) => {
              const filled = stepHasSelection(selection, cat as keyof CompatSelection);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => jumpToStep(i)}
                  aria-current={i === step ? "step" : undefined}
                  aria-label={`${i + 1}. ${t(STEP_KEYS[cat])}`}
                  className={`min-w-0 flex-1 rounded-md px-0.5 py-1 transition ${
                    i === step
                      ? "bg-[var(--cyan)] text-[#041018]"
                      : filled
                        ? "bg-[rgba(52,211,153,0.15)] text-[var(--mint)]"
                        : "bg-[rgba(34,211,238,0.06)] text-[var(--text-muted)]"
                  }`}
                >
                  <span className="block text-[8px] font-medium leading-none tabular-nums opacity-75">
                    {i + 1}
                  </span>
                  <span className="mt-0.5 block truncate text-center text-[9px] font-semibold leading-none tracking-tight">
                    {STEP_SHORT[cat]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mx-auto mt-1.5 flex max-w-[1600px] flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveCurrentBuild}
                disabled={!canClear}
                className="min-h-8 flex-1 rounded-lg text-xs font-semibold text-[var(--cyan)] transition enabled:active:scale-[0.98] enabled:hover:bg-[rgba(34,211,238,0.1)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {savedFlash ? t("builder.saved") : t("builder.saveDraft")}
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={!canClear}
                className="min-h-8 flex-1 rounded-lg text-xs font-semibold text-[var(--danger)] transition enabled:active:scale-[0.98] enabled:hover:bg-[rgba(251,113,133,0.1)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {t("builder.clearAll")}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrev}
                disabled={isFirstStep}
                className="min-h-11 flex-1 rounded-xl border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text)] transition enabled:active:scale-[0.98] enabled:hover:border-[var(--cyan)] enabled:hover:text-[var(--cyan)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {t("builder.prev")}
              </button>
              <button
                type="button"
                onClick={goNextOrBuy}
                disabled={nextDisabled}
                className="min-h-11 flex-1 rounded-xl bg-[var(--cyan)] px-3 text-sm font-semibold text-[#041018] transition enabled:active:scale-[0.98] enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {isLastStep ? t("builder.order") : t("builder.next")}
              </button>
            </div>
          </div>
          <button
            ref={cartBtnRef}
            type="button"
            onClick={() => setPricingOpen(true)}
            aria-expanded={pricingOpen}
            aria-controls="builder-pricing"
            aria-label={t("builder.pricing")}
            className={`absolute flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[rgba(12,20,34,0.95)] text-[var(--cyan)] shadow-[var(--glow)] backdrop-blur-xl ${
              cartBump ? "cart-catch" : ""
            }`}
            style={{
              bottom: "calc(100% + 1.25rem)",
              right: "1.25rem",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none" />
              <path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h9.2a1.5 1.5 0 0 0 1.5-1.2L21 8H7" />
            </svg>
          </button>
        </nav>
      )}

      {throwClones.map((item) => (
        <span
          key={item.id}
          aria-hidden
          className="throw-to-cart pointer-events-none fixed z-[60] overflow-hidden rounded-lg bg-white shadow-[0_10px_28px_rgba(34,211,238,0.35)]"
          style={
            {
              left: item.x,
              top: item.y,
              width: item.w,
              height: item.h,
              "--throw-dx": `${item.dx}px`,
              "--throw-dy": `${item.dy}px`,
            } as React.CSSProperties
          }
          onAnimationEnd={() => finishThrow(item.id)}
        >
          {item.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.src} alt="" className="h-full w-full object-contain p-1" />
          ) : (
            <span className="block h-full w-full bg-[rgba(34,211,238,0.25)]" />
          )}
        </span>
      ))}

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title={t("builder.checkoutTitle")}
        totalMkd={total}
        needsToRun={needsToRun}
        onSubmit={submitOrder}
      />
    </div>
  );
}
