"use client";

import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { formatMkd } from "@/lib/constants";
import { useI18n } from "@/components/LanguageProvider";
import { ProductImage } from "@/components/ProductImage";
import { resolvePartImage } from "@/lib/partImages";
import { AdminImageField } from "@/components/AdminImageField";

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
  imageUrl?: string | null;
  active?: boolean;
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
});

function draftFromPrebuilt(p: Prebuilt): PrebuiltDraft {
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
  };
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
  busy,
  showConditionGrade,
  title,
  saveLabel,
  onSave,
  onCancel,
}: {
  draft: PrebuiltDraft;
  setDraft: Dispatch<SetStateAction<PrebuiltDraft>>;
  busy: boolean;
  showConditionGrade: boolean;
  title: string;
  saveLabel: string;
  onSave: () => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
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
      <div className="grid gap-3 sm:grid-cols-2">
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
      <AdminImageField
        value={draft.imageUrl}
        onChange={(url) => setDraft((d) => ({ ...d, imageUrl: url }))}
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
  const [busy, setBusy] = useState(false);

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
    setPrebuiltDraft(draftFromPrebuilt(p));
  }

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
