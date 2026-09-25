"use client";

import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { formatMkd } from "@/lib/constants";
import { useI18n } from "@/components/LanguageProvider";
import { ProductImage } from "@/components/ProductImage";
import { resolvePartImage } from "@/lib/partImages";
import { AdminImageField } from "@/components/AdminImageField";
import {
  checkCompatibility,
  clampRamQty,
  cpuHasIntegratedGraphics,
  cpuNeedsCooler,
  createNonePart,
  filterCompatibleParts,
  hasBlockingErrors,
  isNonePart,
  pruneIncompatibleSelection,
  ramQtySlotLimit,
  selectionPriceMkd,
  type CompatPart,
  type CompatSelection,
} from "@/lib/compatibility";
import { describeReadyPc, PREBUILT_MARKUP } from "@/lib/prebuiltFromParts";
import { inferListingGpuTdp } from "@/lib/listingPower";

export type AdminPart = {
  id: string;
  name: string;
  brand: string;
  category: string;
  stock: number;
  priceMkd: number;
  socket?: string | null;
  ramType?: string | null;
  wattage?: number | null;
  tdpWatts?: number | null;
  formFactor?: string | null;
  includesCooler?: boolean | null;
  imageUrl?: string | null;
  active?: boolean;
  /** Marketplace listing mapped into the prebuilt picker. */
  source?: "new" | "used";
};

type Prebuilt = {
  id: string;
  name: string;
  description?: string;
  cpuLabel?: string;
  coolerLabel?: string;
  motherboardLabel?: string;
  ramLabel?: string;
  gpuLabel?: string;
  ssdLabel?: string;
  psuLabel?: string;
  caseLabel?: string;
  stock: number;
  priceMkd: number;
  imageUrl?: string | null;
  condition?: string;
  conditionGrade?: string;
  active?: boolean;
};

const SLOT_FIELDS = [
  ["CPU", "cpuLabel", "admin.fieldCpu"],
  ["COOLER", "coolerLabel", "admin.fieldCooler"],
  ["MOTHERBOARD", "motherboardLabel", "admin.fieldMotherboard"],
  ["RAM", "ramLabel", "admin.fieldRam"],
  ["GPU", "gpuLabel", "admin.fieldGpu"],
  ["SSD", "ssdLabel", "admin.fieldSsd"],
  ["PSU", "psuLabel", "admin.fieldPsu"],
  ["CASE", "caseLabel", "admin.fieldCase"],
] as const;

type SlotId = (typeof SLOT_FIELDS)[number][0];
type SlotMap = Record<SlotId, string>;

const IGPU = "__igpu";
const STOCK_COOLER = "__stock";

function emptySlots(): SlotMap {
  return {
    CPU: "",
    COOLER: "",
    MOTHERBOARD: "",
    RAM: "",
    GPU: "",
    SSD: "",
    PSU: "",
    CASE: "",
  };
}

type PrebuiltDraft = {
  name: string;
  description: string;
  cpuLabel: string;
  coolerLabel: string;
  motherboardLabel: string;
  ramLabel: string;
  gpuLabel: string;
  ssdLabel: string;
  psuLabel: string;
  caseLabel: string;
  priceMkd: number;
  stock: number;
  imageUrl: string;
  condition: "new" | "used";
  conditionGrade: string;
  slots: SlotMap;
  ramQty: number;
  priceManual: boolean;
  imageManual: boolean;
  autoDescription: string;
};

const emptyPrebuiltDraft = (): PrebuiltDraft => ({
  name: "",
  description: "",
  cpuLabel: "",
  coolerLabel: "",
  motherboardLabel: "",
  ramLabel: "",
  gpuLabel: "",
  ssdLabel: "",
  psuLabel: "",
  caseLabel: "",
  priceMkd: 0,
  stock: 1,
  imageUrl: "",
  condition: "new",
  conditionGrade: "",
  slots: emptySlots(),
  ramQty: 1,
  priceManual: false,
  imageManual: false,
  autoDescription: "",
});

function partLine(part: { brand: string; name: string }): string {
  return `${part.brand} ${part.name}`.replace(/\s+/g, " ").trim();
}

function toCompatPart(part: AdminPart): CompatPart {
  return {
    id: part.id,
    category: part.category,
    name: part.name,
    brand: part.brand,
    socket: part.socket,
    ramType: part.ramType,
    wattage: part.wattage,
    tdpWatts: part.tdpWatts,
    formFactor: part.formFactor,
    includesCooler: part.includesCooler,
    priceMkd: part.priceMkd,
    stock: part.stock,
  };
}

const BUILDER_CATEGORIES = new Set<string>(SLOT_FIELDS.map(([slot]) => slot));

function listingToAdminPart(listing: {
  id: string;
  name: string;
  category: string;
  priceMkd: number;
  imageUrl: string | null;
  sellerName: string;
}): AdminPart | null {
  if (!BUILDER_CATEGORIES.has(listing.category)) return null;
  return {
    id: `listing:${listing.id}`,
    name: listing.name,
    brand: listing.sellerName || "Used",
    category: listing.category,
    priceMkd: listing.priceMkd,
    stock: 1,
    imageUrl: listing.imageUrl,
    tdpWatts: listing.category === "GPU" ? inferListingGpuTdp(listing.name) : null,
    active: true,
    source: "used",
  };
}

function matchSlot(parts: AdminPart[], category: SlotId, label: string): { id: string; ramQty?: number } {
  const raw = label.trim();
  if (!raw) return { id: "" };
  if (category === "GPU" && /integrated/i.test(raw)) return { id: IGPU };
  if (category === "COOLER" && /included/i.test(raw)) return { id: STOCK_COOLER };
  let text = raw;
  let ramQty: number | undefined;
  const qtyMatch = raw.match(/^(.*)\s*[×x]\s*(\d+)\s*$/i);
  if (qtyMatch && category === "RAM") {
    text = qtyMatch[1].trim();
    ramQty = Number(qtyMatch[2]) || 1;
  }
  const norm = text.toLowerCase();
  const hit = parts.find(
    (part) => part.category === category && partLine(part).toLowerCase() === norm,
  );
  return { id: hit?.id ?? "", ramQty };
}

function draftFromPrebuilt(p: Prebuilt, parts: AdminPart[]): PrebuiltDraft {
  const slots = emptySlots();
  let ramQty = 1;
  if (p.condition !== "used") {
    for (const [category, key] of SLOT_FIELDS) {
      const matched = matchSlot(parts, category, p[key] || "");
      slots[category] = matched.id;
      if (matched.ramQty) ramQty = matched.ramQty;
    }
  }
  return {
    name: p.name || "",
    description: p.description || "",
    cpuLabel: p.cpuLabel || "",
    coolerLabel: p.coolerLabel || "",
    motherboardLabel: p.motherboardLabel || "",
    ramLabel: p.ramLabel || "",
    gpuLabel: p.gpuLabel || "",
    ssdLabel: p.ssdLabel || "",
    psuLabel: p.psuLabel || "",
    caseLabel: p.caseLabel || "",
    priceMkd: p.priceMkd,
    stock: p.stock,
    imageUrl: p.imageUrl || "",
    condition: p.condition === "used" ? "used" : "new",
    conditionGrade: p.conditionGrade || "",
    slots,
    ramQty,
    priceManual: true,
    imageManual: Boolean(p.imageUrl),
    autoDescription: "",
  };
}

function selectionFromSlots(slots: SlotMap, parts: AdminPart[]): CompatSelection {
  const pick = (id: string) => {
    const part = parts.find((item) => item.id === id);
    return part ? toCompatPart(part) : null;
  };
  const sel: CompatSelection = {};
  const cpu = pick(slots.CPU);
  if (cpu) sel.CPU = cpu;
  if (slots.COOLER === STOCK_COOLER) sel.COOLER = createNonePart("COOLER");
  else {
    const cooler = pick(slots.COOLER);
    if (cooler) sel.COOLER = cooler;
  }
  if (slots.GPU === IGPU) sel.GPU = createNonePart("GPU");
  else {
    const gpu = pick(slots.GPU);
    if (gpu) sel.GPU = gpu;
  }
  const board = pick(slots.MOTHERBOARD);
  if (board) sel.MOTHERBOARD = board;
  const ram = pick(slots.RAM);
  if (ram) sel.RAM = ram;
  const psu = pick(slots.PSU);
  if (psu) sel.PSU = psu;
  const pcCase = pick(slots.CASE);
  if (pcCase) sel.CASE = pcCase;
  const ssd = pick(slots.SSD);
  if (ssd) sel.SSD = [ssd];
  return sel;
}

function slotsFromSelection(sel: CompatSelection, prev: SlotMap): SlotMap {
  const single = (key: Exclude<SlotId, "SSD">, special?: string): string => {
    const value = sel[key];
    if (!value || Array.isArray(value)) return "";
    if (isNonePart(value)) return special && prev[key] === special ? special : "";
    return value.id;
  };
  const ssd = sel.SSD?.find((part) => !isNonePart(part));
  return {
    CPU: single("CPU"),
    COOLER: single("COOLER", STOCK_COOLER),
    MOTHERBOARD: single("MOTHERBOARD"),
    RAM: single("RAM"),
    GPU: single("GPU", IGPU),
    SSD: ssd?.id ?? "",
    PSU: single("PSU"),
    CASE: single("CASE"),
  };
}

function slotLabel(category: SlotId, id: string, parts: AdminPart[], ramQty: number): string {
  if (id === IGPU) return "Integrated graphics";
  if (id === STOCK_COOLER) return "Included with CPU";
  const part = parts.find((item) => item.id === id);
  if (!part) return "";
  const base = partLine(part);
  const labeled = category === "RAM" && ramQty > 1 ? `${base} ×${ramQty}` : base;
  return labeled.slice(0, 120);
}

function withCatalogSelection(
  draft: PrebuiltDraft,
  parts: AdminPart[],
  patch: { slots?: SlotMap; ramQty?: number; changed?: SlotId },
): PrebuiltDraft {
  let slots = { ...draft.slots, ...(patch.slots ?? {}) };
  let sel = selectionFromSlots(slots, parts);
  if (patch.changed) {
    sel = pruneIncompatibleSelection(sel, patch.changed);
    slots = slotsFromSelection(sel, slots);
  }

  const cpu = sel.CPU && !isNonePart(sel.CPU) ? sel.CPU : null;
  if (slots.GPU === IGPU && (!cpu || !cpuHasIntegratedGraphics(cpu))) {
    slots = { ...slots, GPU: "" };
  }
  if (slots.COOLER === STOCK_COOLER && (!cpu || cpuNeedsCooler(cpu))) {
    slots = { ...slots, COOLER: "" };
  }
  if (patch.changed === "CPU" && cpu && !cpuNeedsCooler(cpu) && !slots.COOLER) {
    slots = { ...slots, COOLER: STOCK_COOLER };
  }
  sel = selectionFromSlots(slots, parts);

  let ramQty = patch.ramQty ?? draft.ramQty;
  const ram = sel.RAM && !isNonePart(sel.RAM) ? sel.RAM : null;
  const board = sel.MOTHERBOARD && !isNonePart(sel.MOTHERBOARD) ? sel.MOTHERBOARD : null;
  ramQty = ram ? clampRamQty(ramQty || 1, ram.stock, ramQtySlotLimit(board, ram)) : Math.max(1, ramQty || 1);

  const next: PrebuiltDraft = { ...draft, slots, ramQty };
  for (const [category, key] of SLOT_FIELDS) {
    const id = slots[category];
    if (id) next[key] = slotLabel(category, id, parts, ramQty);
    else if (draft.slots[category]) next[key] = "";
  }

  const cost = selectionPriceMkd(sel, ramQty, 1);
  if (!draft.priceManual && cost > 0) next.priceMkd = Math.round(cost * PREBUILT_MARKUP);

  if (next.cpuLabel && next.gpuLabel && next.ramLabel && next.ssdLabel) {
    const auto = describeReadyPc({
      cpuLabel: next.cpuLabel,
      gpuLabel: next.gpuLabel,
      ramLabel: next.ramLabel,
      ssdLabel: next.ssdLabel,
    }).slice(0, 500);
    if (!draft.description.trim() || draft.description === draft.autoDescription) {
      next.description = auto;
      next.autoDescription = auto;
    }
  }

  if (!draft.imageManual) {
    const pcCase = slots.CASE ? parts.find((part) => part.id === slots.CASE) : undefined;
    next.imageUrl = pcCase?.imageUrl || "";
  }

  return next;
}

function selectionForCheck(draft: PrebuiltDraft, parts: AdminPart[]): CompatSelection {
  const sel = selectionFromSlots(draft.slots, parts);
  if (!sel.COOLER && draft.coolerLabel.trim()) {
    sel.COOLER = {
      id: "label-cooler",
      category: "COOLER",
      name: draft.coolerLabel,
      brand: "",
      tdpWatts: 300,
    };
  }
  return sel;
}

function partOptionLabel(part: AdminPart, t: (key: string, vars?: Record<string, string | number>) => string) {
  const price = `${part.brand} ${part.name} — ${formatMkd(part.priceMkd)}`;
  if (part.source === "used") return price;
  if (part.stock <= 0) return `${price} (${t("admin.outOfStock")})`;
  return `${price} (${t("admin.stockCount", { count: part.stock })})`;
}

function slotOptions(parts: AdminPart[], category: SlotId, draft: PrebuiltDraft): AdminPart[] {
  const selected = draft.slots[category];
  const compatible = filterCompatibleParts(
    parts.map(toCompatPart),
    category,
    selectionFromSlots(draft.slots, parts),
  );
  const allowed = new Set(compatible.map((part) => part.id));
  return parts
    .filter(
      (part) =>
        part.category === category &&
        (part.active !== false || part.id === selected) &&
        (allowed.has(part.id) || part.id === selected),
    )
    .slice()
    .sort((a, b) => Number(a.stock <= 0) - Number(b.stock <= 0) || a.priceMkd - b.priceMkd);
}

function pillClass(active: boolean) {
  return `rounded-full px-3 py-1.5 text-xs font-medium transition ${
    active
      ? "bg-[var(--cyan)] text-[#041018]"
      : "bg-[rgba(34,211,238,0.06)] text-[var(--text-muted)] hover:text-[var(--text)]"
  }`;
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function StatChip({ label, value, tone }: { label: string; value: number; tone?: "warn" | "muted" }) {
  const color =
    tone === "warn"
      ? "text-[var(--danger)]"
      : tone === "muted"
        ? "text-[var(--text-muted)]"
        : "text-[var(--cyan)]";
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[rgba(7,11,18,0.4)] px-3 py-2">
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
      <p className={`section-title text-lg leading-tight ${color}`}>{value}</p>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
      {children}
    </div>
  );
}

function PrebuiltListRow({
  p,
  usedLabel,
  busy,
  onToggleVisible,
  onEdit,
  onDelete,
}: {
  p: Prebuilt;
  usedLabel?: string;
  busy: boolean;
  onToggleVisible: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const specs = [p.cpuLabel, p.gpuLabel, p.ramLabel].filter(Boolean).join(" · ");
  const isActive = p.active !== false;
  const outOfStock = p.stock <= 0;
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 ${!isActive ? "opacity-60" : ""}`}>
      <ProductImage src={p.imageUrl || ""} alt={p.name} className="!w-12 shrink-0 !rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate font-medium">{p.name}</p>
          {p.condition === "used" && usedLabel && (
            <span className="text-xs font-normal text-[var(--cyan-dim)]">
              {p.conditionGrade?.trim() || usedLabel}
            </span>
          )}
          {outOfStock && (
            <span className="badge badge-out-of-stock !px-2 !py-0.5 !text-[10px]">
              {t("admin.outOfStock")}
            </span>
          )}
          {!isActive && (
            <span className="badge !px-2 !py-0.5 !text-[10px] text-[var(--text-muted)]">
              {t("admin.hiddenBadge")}
            </span>
          )}
        </div>
        {specs ? (
          <p className="truncate text-xs text-[var(--text-muted)]">{specs}</p>
        ) : null}
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-sm font-medium">{formatMkd(p.priceMkd)}</p>
        <p className={`text-xs ${outOfStock ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
          {t("admin.stockLabel")}: {p.stock}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          disabled={busy}
          className="btn btn-ghost !px-2.5 !py-1.5 !text-xs"
          onClick={onToggleVisible}
          title={isActive ? t("admin.hidePcHint") : t("admin.showPcHint")}
        >
          {isActive ? t("admin.hide") : t("admin.show")}
        </button>
        <button type="button" className="btn btn-ghost !px-2.5 !py-1.5 !text-xs" onClick={onEdit}>
          {t("admin.edit")}
        </button>
        <button
          type="button"
          className="btn btn-ghost !px-2.5 !py-1.5 !text-xs text-[var(--danger)]"
          onClick={onDelete}
        >
          {t("admin.remove")}
        </button>
      </div>
    </div>
  );
}

function PrebuiltForm({
  draft,
  setDraft,
  parts,
  fromCatalog,
  busy,
  showConditionGrade,
  title,
  saveLabel,
  onSave,
  onCancel,
}: {
  draft: PrebuiltDraft;
  setDraft: Dispatch<SetStateAction<PrebuiltDraft>>;
  parts: AdminPart[];
  fromCatalog: boolean;
  busy: boolean;
  showConditionGrade: boolean;
  title: string;
  saveLabel: string;
  onSave: () => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const sel = fromCatalog ? selectionForCheck(draft, parts) : null;
  const issues = sel ? checkCompatibility(sel, { ramQty: draft.ramQty }) : [];
  const partsCost = sel ? selectionPriceMkd(selectionFromSlots(draft.slots, parts), draft.ramQty, 1) : 0;
  const suggested = partsCost > 0 ? Math.round(partsCost * PREBUILT_MARKUP) : 0;
  const cpu = parts.find((part) => part.id === draft.slots.CPU);
  return (
    <div className="glass mb-4 space-y-4 rounded-2xl p-4">
      <p className="text-sm font-medium text-[var(--cyan)]">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("admin.prebuiltName")} className="sm:col-span-2">
          <input
            className="input !py-2 !text-sm"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </Field>
        {showConditionGrade && (
          <Field label={t("admin.conditionGrade")} className="sm:col-span-2">
            <input
              className="input !py-2 !text-sm"
              value={draft.conditionGrade}
              onChange={(e) => setDraft((d) => ({ ...d, conditionGrade: e.target.value }))}
            />
          </Field>
        )}
        <Field label={t("admin.prebuiltDesc")} className="sm:col-span-2">
          <textarea
            className="input min-h-[72px] !py-2 !text-sm"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        </Field>
      </div>
      {fromCatalog ? (
        <>
          <p className="text-xs text-[var(--text-muted)]">{t("admin.pickFromBuilder")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SLOT_FIELDS.map(([slot, labelKey, titleKey]) => {
              const options = slotOptions(parts, slot, draft);
              const newOptions = options.filter((part) => part.source !== "used");
              const usedOptions = options.filter((part) => part.source === "used");
              const showIgpu = slot === "GPU" && Boolean(cpu && cpuHasIntegratedGraphics(toCompatPart(cpu)));
              const showStock = slot === "COOLER" && Boolean(cpu && !cpuNeedsCooler(toCompatPart(cpu)));
              const unmatched = !draft.slots[slot] && draft[labelKey].trim();
              const ramPart = slot === "RAM" ? parts.find((part) => part.id === draft.slots.RAM) : undefined;
              const board = parts.find((part) => part.id === draft.slots.MOTHERBOARD);
              const ramMax = ramPart
                ? clampRamQty(99, ramPart.stock, ramQtySlotLimit(board ? toCompatPart(board) : null, ramPart))
                : 1;
              return (
                <Field key={slot} label={t(titleKey)}>
                  <select
                    className="input !py-2 !text-sm"
                    value={draft.slots[slot]}
                    onChange={(e) => {
                      const id = e.target.value;
                      setDraft((current) =>
                        withCatalogSelection(current, parts, {
                          slots: { ...current.slots, [slot]: id },
                          changed: slot,
                        }),
                      );
                    }}
                  >
                    <option value="">{t("admin.selectPart")}</option>
                    {showIgpu && <option value={IGPU}>{t("admin.integratedGraphics")}</option>}
                    {showStock && <option value={STOCK_COOLER}>{t("admin.includedCooler")}</option>}
                    {usedOptions.length === 0
                      ? newOptions.map((part) => (
                          <option key={part.id} value={part.id}>
                            {partOptionLabel(part, t)}
                          </option>
                        ))
                      : (
                        <>
                          {newOptions.length > 0 && (
                            <optgroup label={t("builder.conditionNew")}>
                              {newOptions.map((part) => (
                                <option key={part.id} value={part.id}>
                                  {partOptionLabel(part, t)}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label={t("builder.conditionUsed")}>
                            {usedOptions.map((part) => (
                              <option key={part.id} value={part.id}>
                                {partOptionLabel(part, t)}
                              </option>
                            ))}
                          </optgroup>
                        </>
                      )}
                  </select>
                  {slot === "RAM" && draft.slots.RAM && (
                    <label className="mt-2 block">
                      <span className="mb-1 block text-[11px] text-[var(--text-muted)]">{t("admin.ramKits")}</span>
                      <input
                        type="number"
                        min={1}
                        max={ramMax}
                        className="input !py-2 !text-sm"
                        value={draft.ramQty}
                        onChange={(e) =>
                          setDraft((current) =>
                            withCatalogSelection(current, parts, { ramQty: Number(e.target.value) || 1 }),
                          )
                        }
                      />
                    </label>
                  )}
                  {unmatched && (
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      {t("admin.unmatchedSpec", { label: draft[labelKey] })}
                    </p>
                  )}
                  {!options.length && !showIgpu && !showStock && (
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t("admin.noCompatibleParts")}</p>
                  )}
                </Field>
              );
            })}
          </div>
          {issues.length > 0 && (
            <ul className="space-y-1 text-xs">
              {issues.map((issue) => (
                <li
                  key={issue.message}
                  className={issue.severity === "error" ? "text-[var(--danger)]" : "text-[var(--warn)]"}
                >
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["cpuLabel", t("admin.fieldCpu")],
              ["coolerLabel", t("admin.fieldCooler")],
              ["motherboardLabel", t("admin.fieldMotherboard")],
              ["ramLabel", t("admin.fieldRam")],
              ["gpuLabel", t("admin.fieldGpu")],
              ["ssdLabel", t("admin.fieldSsd")],
              ["psuLabel", t("admin.fieldPsu")],
              ["caseLabel", t("admin.fieldCase")],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                className="input !py-2 !text-sm"
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("admin.fieldPrice")}>
          <input
            type="number"
            className="input !py-2 !text-sm"
            value={draft.priceMkd || ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, priceMkd: Number(e.target.value) || 0, priceManual: true }))
            }
          />
          {fromCatalog && suggested > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-[11px] text-[var(--text-muted)]">
                {t("admin.partsCostLine", { cost: formatMkd(partsCost), price: formatMkd(suggested) })}
              </p>
              {draft.priceManual && draft.priceMkd !== suggested && (
                <button
                  type="button"
                  className="text-[11px] text-[var(--cyan)] underline"
                  onClick={() =>
                    setDraft((current) =>
                      withCatalogSelection({ ...current, priceManual: false }, parts, {}),
                    )
                  }
                >
                  {t("admin.useSuggestedPrice")}
                </button>
              )}
            </div>
          )}
        </Field>
        <Field label={t("admin.fieldStock")}>
          <input
            type="number"
            className="input !py-2 !text-sm"
            value={draft.stock || ""}
            onChange={(e) => setDraft((d) => ({ ...d, stock: Number(e.target.value) || 0 }))}
          />
        </Field>
      </div>
      <AdminImageField
        value={draft.imageUrl}
        onChange={(url) => setDraft((d) => ({ ...d, imageUrl: url, imageManual: true }))}
        previewAlt={draft.name || "PC"}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onSave} className="btn btn-success !py-2 !text-sm">
          {saveLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost !py-2 !text-sm" onClick={onCancel}>
            {t("admin.cancel")}
          </button>
        )}
      </div>
    </div>
  );
}

const CATEGORIES = [
  "CPU",
  "COOLER",
  "GPU",
  "MOTHERBOARD",
  "RAM",
  "PSU",
  "CASE",
  "SSD",
] as const;

const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  CPU: "CPU",
  COOLER: "Cooler / Fan",
  GPU: "GPU",
  MOTHERBOARD: "Motherboard",
  RAM: "RAM",
  PSU: "PSU",
  CASE: "Case",
  SSD: "SSD",
};

function categoryLabel(category: string) {
  return CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category;
}

type Draft = {
  name: string;
  brand: string;
  category: string;
  priceMkd: number;
  stock: number;
  socket: string;
  imageUrl: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  brand: "",
  category: "CPU",
  priceMkd: 0,
  stock: 0,
  socket: "",
  imageUrl: "",
});

function PartFields({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("admin.fieldBrand")}>
        <input
          className="input !py-2 !text-sm"
          value={draft.brand}
          onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
        />
      </Field>
      <Field label={t("admin.fieldName")}>
        <input
          className="input !py-2 !text-sm"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
      </Field>
      <Field label={t("admin.colCategory")}>
        <select
          className="input !py-2 !text-sm"
          value={draft.category}
          onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("admin.fieldSocket")}>
        <input
          className="input !py-2 !text-sm"
          value={draft.socket}
          onChange={(e) => setDraft((d) => ({ ...d, socket: e.target.value }))}
        />
      </Field>
      <Field label={t("admin.fieldPrice")}>
        <input
          type="number"
          className="input !py-2 !text-sm"
          value={draft.priceMkd || ""}
          onChange={(e) => setDraft((d) => ({ ...d, priceMkd: Number(e.target.value) || 0 }))}
        />
      </Field>
      <Field label={t("admin.fieldStock")}>
        <input
          type="number"
          className="input !py-2 !text-sm"
          value={draft.stock || ""}
          onChange={(e) => setDraft((d) => ({ ...d, stock: Number(e.target.value) || 0 }))}
        />
      </Field>
    </div>
  );
}

type Props = {
  parts: AdminPart[];
  prebuilts: Prebuilt[];
  onRefresh: () => Promise<void>;
  onMessage: (msg: string) => void;
};

type InvView = "parts" | "prebuilts" | "used";

export function AdminInventory({ parts, prebuilts, onRefresh, onMessage }: Props) {
  const { t } = useI18n();
  const [view, setView] = useState<InvView>("parts");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [visibilityFilter, setVisibilityFilter] = useState<"ALL" | "VISIBLE" | "HIDDEN">("ALL");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<Draft>(emptyDraft());
  const [addingPrebuilt, setAddingPrebuilt] = useState(false);
  const [editingPrebuiltId, setEditingPrebuiltId] = useState<string | null>(null);
  const [prebuiltDraft, setPrebuiltDraft] = useState<PrebuiltDraft>(emptyPrebuiltDraft());
  const [usedParts, setUsedParts] = useState<AdminPart[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sell?partsOnly=1")
      .then((r) => r.json())
      .then((d: { items?: Parameters<typeof listingToAdminPart>[0][] }) => {
        if (cancelled) return;
        setUsedParts(
          (d.items ?? [])
            .map(listingToAdminPart)
            .filter((part): part is AdminPart => part !== null),
        );
      })
      .catch(() => {
        if (!cancelled) setUsedParts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const builderParts = useMemo(() => [...parts, ...usedParts], [parts, usedParts]);

  const newPrebuilts = useMemo(
    () => prebuilts.filter((p) => p.condition !== "used"),
    [prebuilts],
  );
  const usedPrebuilts = useMemo(
    () => prebuilts.filter((p) => p.condition === "used"),
    [prebuilts],
  );

  const hiddenCount = useMemo(() => parts.filter((p) => p.active === false).length, [parts]);
  const outCount = useMemo(() => parts.filter((p) => p.stock <= 0).length, [parts]);
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: parts.length };
    for (const c of CATEGORIES) counts[c] = 0;
    for (const p of parts) counts[p.category] = (counts[p.category] || 0) + 1;
    return counts;
  }, [parts]);

  function switchView(next: InvView) {
    setView(next);
    setAdding(false);
    setEditingId(null);
    setAddingPrebuilt(false);
    setEditingPrebuiltId(null);
    setPrebuiltDraft(emptyPrebuiltDraft());
    setSearch("");
    setCategoryFilter("ALL");
    setVisibilityFilter("ALL");
  }

  function openAddForm(condition: "new" | "used") {
    if (addingPrebuilt && !editingPrebuiltId && prebuiltDraft.condition === condition) {
      setAddingPrebuilt(false);
      setPrebuiltDraft(emptyPrebuiltDraft());
      return;
    }
    setEditingPrebuiltId(null);
    setAddingPrebuilt(true);
    setPrebuiltDraft({ ...emptyPrebuiltDraft(), condition });
  }

  function startEditPrebuilt(p: Prebuilt) {
    setAddingPrebuilt(false);
    setEditingPrebuiltId(p.id);
    setPrebuiltDraft(draftFromPrebuilt(p, builderParts));
  }

  useEffect(() => {
    if (!editingPrebuiltId || usedParts.length === 0) return;
    const pc = prebuilts.find((item) => item.id === editingPrebuiltId);
    if (!pc || pc.condition === "used") return;
    const matched = draftFromPrebuilt(pc, builderParts);
    setPrebuiltDraft((current) => {
      if (current.condition !== "new") return current;
      let changed = false;
      const slots = { ...current.slots };
      for (const [category] of SLOT_FIELDS) {
        if (!slots[category] && matched.slots[category]) {
          slots[category] = matched.slots[category];
          changed = true;
        }
      }
      if (!changed) return current;
      return { ...current, slots, ramQty: matched.ramQty || current.ramQty };
    });
  }, [editingPrebuiltId, usedParts, builderParts, prebuilts]);

  function cancelPrebuiltForm() {
    setAddingPrebuilt(false);
    setEditingPrebuiltId(null);
    setPrebuiltDraft(emptyPrebuiltDraft());
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parts.filter((p) => {
      const isActive = p.active !== false;
      if (visibilityFilter === "VISIBLE" && !isActive) return false;
      if (visibilityFilter === "HIDDEN" && isActive) return false;
      if (categoryFilter !== "ALL" && p.category !== categoryFilter) return false;
      if (!q) return true;
      return `${p.brand} ${p.name} ${p.category} ${p.socket || ""}`.toLowerCase().includes(q);
    });
  }, [parts, categoryFilter, visibilityFilter, search]);

  const grouped = useMemo(() => {
    if (categoryFilter !== "ALL") {
      return [{ category: categoryFilter, items: filtered }];
    }
    return CATEGORIES.map((category) => ({
      category,
      items: filtered.filter((p) => p.category === category),
    })).filter((group) => group.items.length > 0);
  }, [filtered, categoryFilter]);

  const catalogList = view === "used" ? usedPrebuilts : newPrebuilts;
  const catalogHidden = useMemo(
    () => catalogList.filter((p) => p.active === false).length,
    [catalogList],
  );
  const catalogOut = useMemo(
    () => catalogList.filter((p) => p.stock <= 0).length,
    [catalogList],
  );

  const filteredPrebuilts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalogList.filter((p) => {
      const isActive = p.active !== false;
      if (visibilityFilter === "VISIBLE" && !isActive) return false;
      if (visibilityFilter === "HIDDEN" && isActive) return false;
      if (!q) return true;
      return `${p.name} ${p.cpuLabel || ""} ${p.gpuLabel || ""} ${p.ramLabel || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [catalogList, search, visibilityFilter]);

  function startEdit(p: AdminPart) {
    setAdding(false);
    setEditingId(p.id);
    setDraft({
      name: p.name,
      brand: p.brand,
      category: p.category,
      priceMkd: p.priceMkd,
      stock: p.stock,
      socket: p.socket || "",
      imageUrl: p.imageUrl || "",
    });
  }

  async function toggleVisible(p: AdminPart) {
    const next = p.active === false;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "part", id: p.id, active: next }),
      });
      const j = await res.json();
      if (!res.ok) {
        onMessage(j.error || t("admin.inventoryError"));
        return;
      }
      onMessage(next ? t("admin.partShown") : t("admin.partHidden"));
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function togglePrebuiltVisible(p: Prebuilt) {
    const next = p.active === false;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "prebuilt", id: p.id, active: next }),
      });
      const j = await res.json();
      if (!res.ok) {
        onMessage(j.error || t("admin.inventoryError"));
        return;
      }
      onMessage(next ? t("admin.prebuiltShown") : t("admin.prebuiltHidden"));
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function savePart(id: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "part",
          id,
          name: draft.name,
          brand: draft.brand,
          category: draft.category,
          priceMkd: Number(draft.priceMkd),
          stock: Number(draft.stock),
          socket: draft.socket || null,
          imageUrl: draft.imageUrl || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        onMessage(j.error || t("admin.inventoryError"));
        return;
      }
      onMessage(t("admin.partSaved"));
      setEditingId(null);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function addPart() {
    if (!addDraft.name.trim() || !addDraft.brand.trim()) {
      onMessage(t("admin.partRequired"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addDraft.name,
          brand: addDraft.brand,
          category: addDraft.category,
          priceMkd: Number(addDraft.priceMkd) || 0,
          stock: Number(addDraft.stock) || 0,
          socket: addDraft.socket || null,
          imageUrl: addDraft.imageUrl || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        onMessage(j.error || t("admin.inventoryError"));
        return;
      }
      onMessage(t("admin.partAdded"));
      setAddDraft(emptyDraft());
      setAdding(false);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function removePart(id: string, label: string) {
    if (!window.confirm(t("admin.partDeleteConfirm", { name: label }))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "part", id }),
      });
      const j = await res.json();
      if (!res.ok) {
        onMessage(j.error || t("admin.inventoryError"));
        return;
      }
      onMessage(t("admin.partDeleted"));
      if (editingId === id) setEditingId(null);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function removePrebuilt(id: string, label: string) {
    if (!window.confirm(t("admin.prebuiltDeleteConfirm", { name: label }))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "prebuilt", id }),
      });
      const j = await res.json();
      if (!res.ok) {
        onMessage(j.error || t("admin.inventoryError"));
        return;
      }
      onMessage(t("admin.prebuiltDeleted"));
      if (editingPrebuiltId === id) {
        setEditingPrebuiltId(null);
        setAddingPrebuilt(false);
      }
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function savePrebuilt() {
    if (
      !prebuiltDraft.name.trim() ||
      !prebuiltDraft.description.trim() ||
      !prebuiltDraft.cpuLabel.trim() ||
      !prebuiltDraft.gpuLabel.trim() ||
      !prebuiltDraft.ramLabel.trim() ||
      !prebuiltDraft.ssdLabel.trim()
    ) {
      onMessage(t("admin.prebuiltRequired"));
      return;
    }
    if (prebuiltDraft.condition === "new" && hasBlockingErrors(checkCompatibility(selectionForCheck(prebuiltDraft, builderParts), { ramQty: prebuiltDraft.ramQty }))) {
      onMessage(t("admin.prebuiltCompat"));
      return;
    }

    const payload = {
      kind: "prebuilt" as const,
      name: prebuiltDraft.name.trim(),
      description: prebuiltDraft.description.trim(),
      cpuLabel: prebuiltDraft.cpuLabel.trim(),
      coolerLabel: prebuiltDraft.coolerLabel.trim(),
      motherboardLabel: prebuiltDraft.motherboardLabel.trim(),
      ramLabel: prebuiltDraft.ramLabel.trim(),
      gpuLabel: prebuiltDraft.gpuLabel.trim(),
      ssdLabel: prebuiltDraft.ssdLabel.trim(),
      psuLabel: prebuiltDraft.psuLabel.trim(),
      caseLabel: prebuiltDraft.caseLabel.trim(),
      priceMkd: Number(prebuiltDraft.priceMkd) || 0,
      stock: Number(prebuiltDraft.stock) || 0,
      imageUrl: prebuiltDraft.imageUrl.trim() || null,
      condition: prebuiltDraft.condition,
      conditionGrade: prebuiltDraft.conditionGrade.trim(),
    };

    setBusy(true);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: editingPrebuiltId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingPrebuiltId ? { ...payload, id: editingPrebuiltId } : payload,
        ),
      });
      const j = await res.json();
      if (!res.ok) {
        onMessage(j.error || t("admin.inventoryError"));
        return;
      }
      const isUsed = prebuiltDraft.condition === "used";
      onMessage(
        editingPrebuiltId
          ? isUsed
            ? t("admin.usedUpdated")
            : t("admin.prebuiltUpdated")
          : isUsed
            ? t("admin.usedAdded")
            : t("admin.prebuiltAdded"),
      );
      cancelPrebuiltForm();
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  const views: { id: InvView; label: string; count: number }[] = [
    { id: "parts", label: t("admin.parts"), count: parts.length },
    { id: "prebuilts", label: t("admin.prebuilts"), count: newPrebuilts.length },
    { id: "used", label: t("admin.usedPcs"), count: usedPrebuilts.length },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {views.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => switchView(item.id)}
            className={pillClass(view === item.id)}
          >
            {item.label}
            <span className={`ml-1.5 ${view === item.id ? "opacity-70" : "opacity-60"}`}>
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {view === "parts" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="section-title text-xl">{t("admin.parts")}</h2>
              <p className="mt-1 max-w-xl text-sm text-[var(--text-muted)]">{t("admin.inventoryHint")}</p>
            </div>
            <button
              type="button"
              className="btn btn-primary !px-3 !py-1.5 !text-xs"
              onClick={() => {
                setEditingId(null);
                setAdding((v) => !v);
                setAddDraft(emptyDraft());
              }}
            >
              {adding ? t("admin.cancel") : t("admin.addPart")}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
            <StatChip label={t("admin.parts")} value={parts.length} />
            <StatChip label={t("admin.hiddenBadge")} value={hiddenCount} tone="muted" />
            <StatChip label={t("admin.outOfStock")} value={outCount} tone="warn" />
          </div>

          {adding && (
            <div className="glass space-y-4 rounded-2xl p-4">
              <p className="text-sm font-medium text-[var(--cyan)]">{t("admin.addPartTitle")}</p>
              <PartFields draft={addDraft} setDraft={setAddDraft} />
              <AdminImageField
                value={addDraft.imageUrl}
                onChange={(url) => setAddDraft((d) => ({ ...d, imageUrl: url }))}
                previewSrc={
                  addDraft.imageUrl
                    ? resolvePartImage({
                        brand: addDraft.brand,
                        name: addDraft.name,
                        category: addDraft.category,
                        imageUrl: addDraft.imageUrl,
                      })
                    : null
                }
                previewAlt={addDraft.name || "part"}
              />
              <button
                type="button"
                disabled={busy}
                onClick={addPart}
                className="btn btn-primary !py-2 !text-sm"
              >
                {t("admin.savePart")}
              </button>
            </div>
          )}

          <div className="glass space-y-3 rounded-2xl p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input min-w-[12rem] flex-1 !py-2 !text-sm"
                placeholder={t("admin.searchParts")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["ALL", t("admin.filterVisibilityAll")],
                    ["VISIBLE", t("admin.filterVisible")],
                    ["HIDDEN", t("admin.filterHidden")],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setVisibilityFilter(id)}
                    className={pillClass(visibilityFilter === id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setCategoryFilter("ALL")}
                className={pillClass(categoryFilter === "ALL")}
              >
                {t("admin.filterAllCategories")} ({categoryCounts.ALL})
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryFilter(c)}
                  className={pillClass(categoryFilter === c)}
                >
                  {CATEGORY_LABELS[c]}
                  <span className="ml-1 opacity-60">{categoryCounts[c] || 0}</span>
                </button>
              ))}
            </div>
            <p className="px-1 text-[11px] text-[var(--text-muted)]">
              {t("admin.showingCount", { count: filtered.length })}
            </p>
          </div>

          {!filtered.length ? (
            <EmptyState>{t("admin.noPartsMatch")}</EmptyState>
          ) : (
            <div className="glass overflow-hidden rounded-2xl">
              <div className="hidden border-b border-[var(--border)] bg-[rgba(7,11,18,0.35)] px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)] md:grid md:grid-cols-[2.75rem_minmax(0,1.4fr)_7.5rem_6.5rem_4.5rem_10.5rem] md:items-center md:gap-3">
                <span />
                <span>{t("admin.fieldName")}</span>
                <span>{t("admin.colCategory")}</span>
                <span className="text-right">{t("admin.colPrice")}</span>
                <span className="text-right">{t("admin.stockLabel")}</span>
                <span />
              </div>
              {grouped.map((group) => (
                <div key={group.category}>
                  {categoryFilter === "ALL" && (
                    <div className="border-b border-[var(--border)] bg-[rgba(34,211,238,0.04)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--cyan)]">
                      {categoryLabel(group.category)}
                      <span className="ml-1.5 font-normal text-[var(--text-muted)]">
                        {group.items.length}
                      </span>
                    </div>
                  )}
                  {group.items.map((p) => {
                    const editing = editingId === p.id;
                    const img = resolvePartImage(p);
                    const isActive = p.active !== false;
                    const outOfStock = p.stock <= 0;
                    const lowStock = !outOfStock && p.stock <= 2;
                    return (
                      <div
                        key={p.id}
                        className={`border-b border-[var(--border)] last:border-b-0 ${
                          !isActive ? "opacity-60" : ""
                        } ${editing ? "bg-[rgba(34,211,238,0.04)]" : ""}`}
                      >
                        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 px-3 py-2.5 md:grid-cols-[2.75rem_minmax(0,1.4fr)_7.5rem_6.5rem_4.5rem_10.5rem]">
                          <ProductImage
                            src={img}
                            alt={`${p.brand} ${p.name}`}
                            className="!w-11 shrink-0 !rounded-lg"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate font-medium">
                                {p.brand} {p.name}
                              </p>
                              {outOfStock && (
                                <span className="badge badge-out-of-stock !px-2 !py-0.5 !text-[10px]">
                                  {t("admin.outOfStock")}
                                </span>
                              )}
                              {lowStock && (
                                <span className="badge !border-[rgba(251,191,36,0.35)] !bg-[rgba(251,191,36,0.12)] !px-2 !py-0.5 !text-[10px] !text-[var(--warn)]">
                                  {t("admin.lowStock")}
                                </span>
                              )}
                              {!isActive && (
                                <span className="badge !px-2 !py-0.5 !text-[10px] text-[var(--text-muted)]">
                                  {t("admin.hiddenBadge")}
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-[var(--text-muted)] md:hidden">
                              {categoryLabel(p.category)}
                              {p.socket ? ` · ${p.socket}` : ""} · {formatMkd(p.priceMkd)} · {p.stock}
                            </p>
                            {p.socket ? (
                              <p className="hidden truncate text-xs text-[var(--text-muted)] md:block">
                                {p.socket}
                              </p>
                            ) : null}
                          </div>
                          <p className="hidden truncate text-sm text-[var(--text-muted)] md:block">
                            {categoryLabel(p.category)}
                          </p>
                          <p className="hidden text-right text-sm md:block">{formatMkd(p.priceMkd)}</p>
                          <p
                            className={`hidden text-right text-sm tabular-nums md:block ${
                              outOfStock
                                ? "text-[var(--danger)]"
                                : lowStock
                                  ? "text-[var(--warn)]"
                                  : "text-[var(--mint)]"
                            }`}
                          >
                            {p.stock}
                          </p>
                          <div className="col-span-2 flex justify-end gap-1 md:col-span-1">
                            <button
                              type="button"
                              disabled={busy}
                              className="btn btn-ghost !px-2 !py-1 !text-[11px]"
                              onClick={() => toggleVisible(p)}
                              title={isActive ? t("admin.hideHint") : t("admin.showHint")}
                            >
                              {isActive ? t("admin.hide") : t("admin.show")}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost !px-2 !py-1 !text-[11px] text-[var(--cyan)]"
                              onClick={() => (editing ? setEditingId(null) : startEdit(p))}
                            >
                              {editing ? t("admin.cancel") : t("admin.edit")}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              className="btn btn-ghost !px-2 !py-1 !text-[11px] text-[var(--danger)]"
                              onClick={() => removePart(p.id, `${p.brand} ${p.name}`)}
                            >
                              {t("admin.remove")}
                            </button>
                          </div>
                        </div>
                        {editing && (
                          <div className="space-y-3 border-t border-[var(--border)] px-3 py-4">
                            <div className="flex flex-col gap-4 sm:flex-row">
                              <ProductImage
                                src={resolvePartImage({
                                  ...p,
                                  brand: draft.brand,
                                  name: draft.name,
                                  category: draft.category,
                                  imageUrl: draft.imageUrl || null,
                                })}
                                alt="preview"
                                className="!w-20 shrink-0"
                              />
                              <div className="min-w-0 flex-1 space-y-3">
                                <PartFields draft={draft} setDraft={setDraft} />
                                <AdminImageField
                                  compact
                                  showPreview={false}
                                  value={draft.imageUrl}
                                  onChange={(url) => setDraft((d) => ({ ...d, imageUrl: url }))}
                                />
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => savePart(p.id)}
                                className="btn btn-primary !px-3 !py-1.5 !text-xs"
                              >
                                {t("admin.save")}
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost !px-3 !py-1.5 !text-xs"
                                onClick={() => setEditingId(null)}
                              >
                                {t("admin.cancel")}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(view === "prebuilts" || view === "used") && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="section-title text-xl">
                {view === "used" ? t("admin.usedPcs") : t("admin.prebuilts")}
              </h2>
              <p className="mt-1 max-w-xl text-sm text-[var(--text-muted)]">
                {view === "used" ? t("admin.usedHint") : t("admin.prebuiltsHint")}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary !px-3 !py-1.5 !text-xs"
              onClick={() => openAddForm(view === "used" ? "used" : "new")}
            >
              {addingPrebuilt &&
              !editingPrebuiltId &&
              prebuiltDraft.condition === (view === "used" ? "used" : "new")
                ? t("admin.cancel")
                : view === "used"
                  ? t("admin.addUsed")
                  : t("admin.addPrebuilt")}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
            <StatChip
              label={view === "used" ? t("admin.usedPcs") : t("admin.prebuilts")}
              value={catalogList.length}
            />
            <StatChip label={t("admin.hiddenBadge")} value={catalogHidden} tone="muted" />
            <StatChip label={t("admin.outOfStock")} value={catalogOut} tone="warn" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input min-w-[12rem] max-w-md flex-1 !py-2 !text-sm"
              placeholder={t("admin.searchCatalog")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["ALL", t("admin.filterVisibilityAll")],
                  ["VISIBLE", t("admin.filterVisible")],
                  ["HIDDEN", t("admin.filterHidden")],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setVisibilityFilter(id)}
                  className={pillClass(visibilityFilter === id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {((addingPrebuilt &&
            !editingPrebuiltId &&
            prebuiltDraft.condition === (view === "used" ? "used" : "new")) ||
            Boolean(editingPrebuiltId)) && (
            <PrebuiltForm
              draft={prebuiltDraft}
              setDraft={setPrebuiltDraft}
              parts={builderParts}
              fromCatalog={view === "prebuilts"}
              busy={busy}
              showConditionGrade={view === "used"}
              title={
                editingPrebuiltId
                  ? view === "used"
                    ? t("admin.editUsedTitle")
                    : t("admin.editPrebuiltTitle")
                  : view === "used"
                    ? t("admin.addUsedTitle")
                    : t("admin.addPrebuiltTitle")
              }
              saveLabel={view === "used" ? t("admin.saveUsed") : t("admin.savePrebuilt")}
              onSave={() => void savePrebuilt()}
              onCancel={cancelPrebuiltForm}
            />
          )}

          {!filteredPrebuilts.length ? (
            <EmptyState>
              {search.trim() || visibilityFilter !== "ALL"
                ? t("admin.noPartsMatch")
                : view === "used"
                  ? t("admin.usedEmpty")
                  : t("admin.prebuiltEmpty")}
            </EmptyState>
          ) : (
            <div className="glass divide-y divide-[var(--border)] overflow-hidden rounded-2xl">
              {filteredPrebuilts.map((p) =>
                editingPrebuiltId === p.id ? null : (
                  <PrebuiltListRow
                    key={p.id}
                    p={p}
                    usedLabel={view === "used" ? t("admin.usedTag") : undefined}
                    busy={busy}
                    onToggleVisible={() => void togglePrebuiltVisible(p)}
                    onEdit={() => startEditPrebuilt(p)}
                    onDelete={() => void removePrebuilt(p.id, p.name)}
                  />
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
