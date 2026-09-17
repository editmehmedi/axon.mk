"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ASSEMBLY_FEE_DEFAULT, BUILDER_STEPS, formatMkd } from "@/lib/constants";
import {
  checkCompatibility,
  compatibilityFilterHint,
  createNonePart,
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
  type CompatPart,
  type CompatSelection,
} from "@/lib/compatibility";
import { CheckoutModal } from "@/components/CheckoutModal";
import { FpsEstimatePanel } from "@/components/FpsEstimatePanel";
import { BottleneckPanel } from "@/components/BottleneckPanel";
import { rememberTrackingCode } from "@/components/LiveBuildPipeline";
import { useI18n } from "@/components/LanguageProvider";
import { PartFilters, type PartFilterState } from "@/components/PartFilters";
import { ProductImage } from "@/components/ProductImage";
import { resolvePartImage } from "@/lib/partImages";
import { fetchSessionUser, loginUrl } from "@/lib/clientAuth";
import {
  clearBuilderDraft,
  consumeBuilderCheckoutPending,
  draftHasPicks,
  draftNeedsCatalog,
  hydrateSelection,
  loadBuilderDraft,
  markBuilderCheckoutPending,
  peekBuilderCheckoutPending,
  saveBuilderDraft,
  serializeSelection,
} from "@/lib/builderDraft";

type Part = CompatPart & {
  brand: string;
  priceMkd: number;
  stock: number;
  imageUrl?: string | null;
  includesCooler?: boolean | null;
  source?: "new" | "used";
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

const DEFAULT_FILTERS: PartFilterState = {
  search: "",
  brand: "",
  ramType: "",
  sort: "price-asc",
  priceMin: 0,
  priceMax: 0,
};

const PAGE_SIZE = 9;

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

function stepHasSelection(sel: CompatSelection, cat: keyof CompatSelection): boolean {
  if (cat === "SSD") return getSsds(sel).length > 0;
  return Boolean(sel[cat]);
}

export default function ConfiguratorPage() {
  const { t } = useI18n();
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
  const [ramQtyById, setRamQtyById] = useState<Record<string, number>>({});
  const [ssdQtyById, setSsdQtyById] = useState<Record<string, number>>({});
  const [slotWarning, setSlotWarning] = useState<string | null>(null);
  const [usedPartsReady, setUsedPartsReady] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [resumeCheckout, setResumeCheckout] = useState(false);
  const draftHydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setPartsLoading(true);
    fetch("/api/parts")
      .then((r) => r.json())
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
                brand: l.sellerName || "Used",
                category: l.category,
                priceMkd: l.priceMkd,
                stock: 1,
                imageUrl: l.imageUrl,
                socket: null,
                ramType: null,
                wattage: null,
                tdpWatts: null,
                formFactor: null,
                source: "used" as const,
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
    setFilters({
      search: "",
      brand: "",
      ramType: "",
      sort: "price-asc",
      priceMin: priceBounds.min,
      priceMax: priceBounds.max,
    });
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

  const totalPages = Math.max(1, Math.ceil(options.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedOptions = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return options.slice(start, start + PAGE_SIZE);
  }, [options, safePage]);

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
    if (!canBuySelection(sel)) return;
    if (!(await requireLoginForBuy(sel))) return;
    setCheckoutOpen(true);
  }

  function isPartActive(part: Part): boolean {
    if (currentCat === "SSD") {
      return selectedSsds.some((s) => s.id === part.id);
    }
    const cur = selection[currentCat];
    return Boolean(cur && !Array.isArray(cur) && cur.id === part.id);
  }

  /** Mark current step as skipped (None) if nothing was chosen yet. */
  function ensureStepChoice(sel: CompatSelection): CompatSelection {
    if (isStepComplete(sel, currentCat)) return sel;
    const none = createNonePart(currentCat);
    if (currentCat === "SSD") {
      return { ...sel, SSD: [none] };
    }
    return pruneIncompatibleSelection(
      { ...sel, [currentCat]: none } as CompatSelection,
      currentCat,
    );
  }

  function goPrev() {
    if (step > 0) setStep(step - 1);
  }

  function goNext() {
    setSelection((s) => ensureStepChoice(s));
    if (step < BUILDER_STEPS.length - 1) setStep(step + 1);
  }

  function goNextOrBuy() {
    if (!isLastStep) {
      goNext();
      return;
    }
    const nextSel = ensureStepChoice(selection);
    setSelection(nextSel);
    void beginBuy(nextSel);
  }

  function pick(part: Part) {
    const outOfStock = !partHasStock(part);
    const alreadyOn = isPartActive(part);
    if (outOfStock && !alreadyOn) return;

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
  }

  const selectedGpu =
    selection.GPU && !isNonePart(selection.GPU) ? (selection.GPU as Part) : null;
  const selectedCpu =
    selection.CPU && !isNonePart(selection.CPU) ? (selection.CPU as Part) : null;
  const isFirstStep = step <= 0;
  const isLastStep = step >= BUILDER_STEPS.length - 1;

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
    <div className="mx-auto max-w-[1600px] px-4 py-10 md:px-6">
      <div className="mb-8">
        <h1 className="section-title text-3xl md:text-4xl">{t("builder.title")}</h1>
        <p className="mt-2 text-[var(--text-muted)]">{t("builder.desc")}</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
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
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              condition === id
                ? "bg-[var(--cyan)] text-[#041018]"
                : "bg-[rgba(34,211,238,0.06)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {condition === "used" && (
        <p className="mb-4 text-sm text-[var(--text-muted)]">{t("builder.usedHint")}</p>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {BUILDER_STEPS.map((cat, i) => {
          const filled = stepHasSelection(selection, cat as keyof CompatSelection);
          return (
            <button
              key={cat}
              onClick={() => setStep(i)}
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
          <div className="glass-strong rounded-2xl p-5">
            <h3 className="section-title text-xl">{t("builder.pricing")}</h3>
            <div className="mt-3 space-y-2 text-sm">
              {BUILDER_STEPS.map((cat) => {
                const key = cat as keyof CompatSelection;
                if (key === "SSD") {
                  if (ssdIsNone(selection)) {
                    return (
                      <div key={cat} className="flex justify-between gap-2">
                        <span className="text-[var(--text-muted)]">
                          {t(STEP_KEYS[cat])}
                          <span className="text-[var(--text)]"> · {t("builder.none")}</span>
                        </span>
                        <span className="shrink-0 tabular-nums">{formatMkd(0)}</span>
                      </div>
                    );
                  }
                  const ssd = selectedSsd;
                  if (!ssd) {
                    return (
                      <div key={cat} className="flex justify-between gap-2">
                        <span className="text-[var(--text-muted)]">{t(STEP_KEYS[cat])}</span>
                        <span className="shrink-0">—</span>
                      </div>
                    );
                  }
                  const ssdQty = ssdQtyFor(ssd);
                  return (
                    <div key={cat} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate text-[var(--text-muted)]">
                        {t(STEP_KEYS[cat])}
                        {ssdQty > 1 ? ` ×${ssdQty}` : ""}
                        <span className="text-[var(--text)]">
                          {" "}
                          · {partLabel(ssd, t("builder.usedBadge"))}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatMkd((ssd.priceMkd ?? 0) * ssdQty)}
                      </span>
                    </div>
                  );
                }
                const p = selection[key] as Part | null | undefined;
                const ramQty = key === "RAM" && p && !isNonePart(p) ? ramQtyFor(p) : 1;
                return (
                  <div key={cat} className="flex justify-between gap-2">
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
                    <span className="shrink-0 tabular-nums">
                      {p
                        ? isNonePart(p)
                          ? formatMkd(0)
                          : formatMkd((p.priceMkd ?? 0) * ramQty)
                        : "—"}
                    </span>
                  </div>
                );
              })}
              <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-3">
                <span className="text-[var(--text-muted)]">{t("home.assemblyFee")}</span>
                <span className="shrink-0 tabular-nums text-[var(--mint)]">
                  +{formatMkd(fee)}
                </span>
              </div>
              <div className="flex justify-between border-t border-[var(--border)] pt-3 text-base font-semibold">
                <span>{t("home.totalPrice")}</span>
                <span className="text-[var(--cyan)]">{formatMkd(total)}</span>
              </div>
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

        <div className="order-2 glass rounded-2xl p-4 lg:order-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="section-title text-xl">
                {t(STEP_KEYS[currentCat])}{" "}
                <span className="text-[var(--text-muted)]">/ {currentCat}</span>
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {t("builder.stepOf", { step: step + 1, total: BUILDER_STEPS.length })}
                {!isStepComplete(selection, currentCat)
                  ? ` · ${t("builder.nextSkips")}`
                  : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
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
                disabled={isLastStep && !canBuySelection(ensureStepChoice(selection))}
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
          {currentCat === "COOLER" && selection.CPU && !cpuNeedsCooler(selection.CPU) && (
            <p className="mt-2 text-xs text-[var(--mint)]">{t("builder.coolerIncludedHint")}</p>
          )}
          {currentCat === "SSD" && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {ssdSlotCount
                ? t("builder.ssdQtyHintSlots", { count: ssdSlotCount })
                : t("builder.ssdQtyHint")}
            </p>
          )}
          {currentCat === "RAM" && (
            <>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {ramSlotCount
                  ? t("builder.ramQtyHintSlots", { count: ramSlotCount })
                  : t("builder.ramQtyHint")}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t("builder.ramKitHint")}</p>
            </>
          )}
          {slotWarning && (
            <p className="mt-2 text-xs font-medium text-[var(--warn)]">{slotWarning}</p>
          )}
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t("builder.clickToDeselect")}</p>

          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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
                  onClick={() => pick(part)}
                  onKeyDown={(e) => {
                    if (outOfStock && !active) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      pick(part);
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
                      ? t("builder.sellerLabel", { name: part.brand })
                      : part.brand}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug">{part.name}</p>
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
                        ? `${formatMkd(part.priceMkd)} ×${qty}`
                        : formatMkd(part.priceMkd)}
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

          {options.length > PAGE_SIZE && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-muted)] disabled:opacity-30 hover:text-[var(--text)]"
              >
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={`min-w-8 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-muted)] disabled:opacity-30 hover:text-[var(--text)]"
              >
                ›
              </button>
              <span className="ml-2 text-[11px] text-[var(--text-muted)]">
                {t("builder.pageOf", { page: safePage, pages: totalPages })}
              </span>
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

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title={t("builder.checkoutTitle")}
        totalMkd={total}
        onSubmit={submitOrder}
      />
    </div>
  );
}
