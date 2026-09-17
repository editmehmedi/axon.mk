"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
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

function PrebuiltListRow({
  p,
  usedLabel,
  onEdit,
  onDelete,
}: {
  p: Prebuilt;
  usedLabel?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="glass flex items-center gap-3 rounded-xl p-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {p.name}
          {p.condition === "used" && usedLabel && (
            <span className="ml-2 text-xs font-normal text-[var(--cyan-dim)]">
              · {p.conditionGrade?.trim() || usedLabel}
            </span>
          )}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {formatMkd(p.priceMkd)} · {t("admin.fieldStock")}: {p.stock}
        </p>
      </div>
      <button
        type="button"
        className="btn btn-ghost !px-2.5 !py-1.5 !text-xs"
        onClick={onEdit}
      >
        {t("admin.edit")}
      </button>
      <button
        type="button"
        className="btn btn-ghost !px-2.5 !py-1.5 !text-xs text-[var(--danger,#f87171)]"
        onClick={onDelete}
      >
        {t("admin.remove")}
      </button>
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
    <div className="glass mb-4 space-y-3 rounded-xl p-4">
      <p className="text-sm font-medium text-[var(--cyan)]">{title}</p>
      {showConditionGrade && (
        <input
          className="input !py-2 !text-sm"
          placeholder={t("admin.conditionGrade")}
          value={draft.conditionGrade}
          onChange={(e) => setDraft((d) => ({ ...d, conditionGrade: e.target.value }))}
        />
      )}
      <input
        className="input !py-2 !text-sm"
        placeholder={t("admin.prebuiltName")}
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
      />
      <textarea
        className="input min-h-[72px] !py-2 !text-sm"
        placeholder={t("admin.prebuiltDesc")}
        value={draft.description}
        onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
      />
      <div className="grid gap-2 sm:grid-cols-2">
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
          <input
            key={key}
            className="input !py-2 !text-sm"
            placeholder={label}
            value={draft[key]}
            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
          />
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          type="number"
          className="input !py-2 !text-sm"
          placeholder={t("admin.fieldPrice")}
          value={draft.priceMkd || ""}
          onChange={(e) => setDraft((d) => ({ ...d, priceMkd: Number(e.target.value) || 0 }))}
        />
        <input
          type="number"
          className="input !py-2 !text-sm"
          placeholder={t("admin.fieldStock")}
          value={draft.stock || ""}
          onChange={(e) => setDraft((d) => ({ ...d, stock: Number(e.target.value) || 0 }))}
        />
      </div>
      <AdminImageField
        value={draft.imageUrl}
        onChange={(url) => setDraft((d) => ({ ...d, imageUrl: url }))}
        previewAlt={draft.name || "PC"}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onSave}
          className="btn btn-success !py-2 !text-sm"
        >
          {saveLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            className="btn btn-ghost !py-2 !text-sm"
            onClick={onCancel}
          >
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

type Props = {
  parts: AdminPart[];
  prebuilts: Prebuilt[];
  onRefresh: () => Promise<void>;
  onMessage: (msg: string) => void;
};

export function AdminInventory({ parts, prebuilts, onRefresh, onMessage }: Props) {
  const { t } = useI18n();
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
      return `${p.brand} ${p.name} ${p.category}`.toLowerCase().includes(q);
    });
  }, [parts, categoryFilter, visibilityFilter, search]);

  function startEdit(p: AdminPart) {
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
      <div className="space-y-8">
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title text-lg">{t("admin.prebuilts")}</h2>
            <button
              type="button"
              className="btn btn-primary !px-3 !py-1.5 !text-xs"
              onClick={() => openAddForm("new")}
            >
              {addingPrebuilt && !editingPrebuiltId && prebuiltDraft.condition === "new"
                ? t("admin.cancel")
                : t("admin.addPrebuilt")}
            </button>
          </div>

          {((addingPrebuilt && !editingPrebuiltId && prebuiltDraft.condition === "new") ||
            (editingPrebuiltId &&
              newPrebuilts.some((p) => p.id === editingPrebuiltId))) && (
            <PrebuiltForm
              draft={prebuiltDraft}
              setDraft={setPrebuiltDraft}
              busy={busy}
              showConditionGrade={false}
              title={
                editingPrebuiltId ? t("admin.editPrebuiltTitle") : t("admin.addPrebuiltTitle")
              }
              saveLabel={t("admin.savePrebuilt")}
              onSave={() => void savePrebuilt()}
              onCancel={cancelPrebuiltForm}
            />
          )}

          <div className="space-y-2">
            {newPrebuilts.map((p) =>
              editingPrebuiltId === p.id ? null : (
                <PrebuiltListRow
                  key={p.id}
                  p={p}
                  onEdit={() => startEditPrebuilt(p)}
                  onDelete={() => void removePrebuilt(p.id, p.name)}
                />
              ),
            )}
            {!newPrebuilts.length && (
              <p className="text-sm text-[var(--text-muted)]">{t("admin.prebuiltEmpty")}</p>
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title text-lg">{t("admin.usedPcs")}</h2>
            <button
              type="button"
              className="btn btn-primary !px-3 !py-1.5 !text-xs"
              onClick={() => openAddForm("used")}
            >
              {addingPrebuilt && !editingPrebuiltId && prebuiltDraft.condition === "used"
                ? t("admin.cancel")
                : t("admin.addUsed")}
            </button>
          </div>

          {((addingPrebuilt && !editingPrebuiltId && prebuiltDraft.condition === "used") ||
            (editingPrebuiltId &&
              usedPrebuilts.some((p) => p.id === editingPrebuiltId))) && (
            <PrebuiltForm
              draft={prebuiltDraft}
              setDraft={setPrebuiltDraft}
              busy={busy}
              showConditionGrade
              title={editingPrebuiltId ? t("admin.editUsedTitle") : t("admin.addUsedTitle")}
              saveLabel={t("admin.saveUsed")}
              onSave={() => void savePrebuilt()}
              onCancel={cancelPrebuiltForm}
            />
          )}

          <div className="space-y-2">
            {usedPrebuilts.map((p) =>
              editingPrebuiltId === p.id ? null : (
                <PrebuiltListRow
                  key={p.id}
                  p={p}
                  usedLabel={t("admin.usedTag")}
                  onEdit={() => startEditPrebuilt(p)}
                  onDelete={() => void removePrebuilt(p.id, p.name)}
                />
              ),
            )}
            {!usedPrebuilts.length && (
              <p className="text-sm text-[var(--text-muted)]">{t("admin.usedEmpty")}</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="section-title text-lg">{t("admin.parts")}</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{t("admin.inventoryHint")}</p>
          </div>
          <button
            type="button"
            className="btn btn-primary !px-3 !py-1.5 !text-xs"
            onClick={() => {
              setAdding((v) => !v);
              setAddDraft(emptyDraft());
            }}
          >
            {adding ? t("admin.cancel") : t("admin.addPart")}
          </button>
        </div>

        {adding && (
          <div className="glass mb-4 space-y-3 rounded-xl p-4">
            <p className="text-sm font-medium text-[var(--cyan)]">{t("admin.addPartTitle")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="input !py-2 !text-sm"
                placeholder={t("admin.fieldBrand")}
                value={addDraft.brand}
                onChange={(e) => setAddDraft((d) => ({ ...d, brand: e.target.value }))}
              />
              <input
                className="input !py-2 !text-sm"
                placeholder={t("admin.fieldName")}
                value={addDraft.name}
                onChange={(e) => setAddDraft((d) => ({ ...d, name: e.target.value }))}
              />
              <select
                className="input !py-2 !text-sm"
                value={addDraft.category}
                onChange={(e) => setAddDraft((d) => ({ ...d, category: e.target.value }))}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
              <input
                className="input !py-2 !text-sm"
                placeholder={t("admin.fieldSocket")}
                value={addDraft.socket}
                onChange={(e) => setAddDraft((d) => ({ ...d, socket: e.target.value }))}
              />
              <input
                type="number"
                className="input !py-2 !text-sm"
                placeholder={t("admin.fieldPrice")}
                value={addDraft.priceMkd || ""}
                onChange={(e) =>
                  setAddDraft((d) => ({ ...d, priceMkd: Number(e.target.value) || 0 }))
                }
              />
              <input
                type="number"
                className="input !py-2 !text-sm"
                placeholder={t("admin.fieldStock")}
                value={addDraft.stock || ""}
                onChange={(e) =>
                  setAddDraft((d) => ({ ...d, stock: Number(e.target.value) || 0 }))
                }
              />
            </div>
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

        <div className="mb-3 flex flex-wrap gap-2">
          <input
            className="input !max-w-xs !py-1.5 !text-xs"
            placeholder={t("admin.searchParts")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input !w-auto !py-1.5 !text-xs"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="ALL">{t("admin.filterAllCategories")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            className="input !w-auto !py-1.5 !text-xs"
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value as "ALL" | "VISIBLE" | "HIDDEN")}
          >
            <option value="ALL">{t("admin.filterVisibilityAll")}</option>
            <option value="VISIBLE">{t("admin.filterVisible")}</option>
            <option value="HIDDEN">{t("admin.filterHidden")}</option>
          </select>
        </div>

        <div className="max-h-[36rem] space-y-2 overflow-y-auto pr-1">
          {filtered.map((p) => {
            const editing = editingId === p.id;
            const img = resolvePartImage(p);
            const isActive = p.active !== false;
            const outOfStock = p.stock <= 0;
            return (
              <div
                key={p.id}
                className={`glass rounded-xl p-3 text-sm ${!isActive ? "opacity-55" : ""}`}
              >
                {!editing ? (
                  <div className="flex items-start gap-3">
                    <ProductImage
                      src={img}
                      alt={`${p.brand} ${p.name}`}
                      className="!w-16 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-medium">
                          {p.brand} {p.name}
                        </p>
                        {outOfStock && (
                          <span className="rounded-full bg-[rgba(251,113,133,0.15)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--danger)]">
                            {t("admin.outOfStock")}
                          </span>
                        )}
                        {!isActive && (
                          <span className="rounded-full bg-[rgba(139,155,180,0.18)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                            {t("admin.hiddenBadge")}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS] || p.category}
                        {p.socket ? ` · ${p.socket}` : ""} · {formatMkd(p.priceMkd)} ·{" "}
                        {t("admin.stockLabel")}: {p.stock}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        disabled={busy}
                        className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                          isActive
                            ? "bg-[rgba(139,155,180,0.15)] text-[var(--text-muted)]"
                            : "bg-[rgba(52,211,153,0.15)] text-[var(--mint)]"
                        }`}
                        onClick={() => toggleVisible(p)}
                        title={isActive ? t("admin.hideHint") : t("admin.showHint")}
                      >
                        {isActive ? t("admin.hide") : t("admin.show")}
                      </button>
                      <button
                        type="button"
                        className="rounded-md bg-[rgba(34,211,238,0.12)] px-2 py-1 text-[11px] font-medium text-[var(--cyan)]"
                        onClick={() => startEdit(p)}
                      >
                        {t("admin.edit")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-md bg-[rgba(251,113,133,0.12)] px-2 py-1 text-[11px] font-medium text-[var(--danger)]"
                        onClick={() => removePart(p.id, `${p.brand} ${p.name}`)}
                      >
                        {t("admin.remove")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-3">
                      <ProductImage
                        src={resolvePartImage({
                          ...p,
                          brand: draft.brand,
                          name: draft.name,
                          category: draft.category,
                          imageUrl: draft.imageUrl || null,
                        })}
                        alt="preview"
                        className="!w-16 shrink-0"
                      />
                      <div className="grid flex-1 gap-2 sm:grid-cols-2">
                        <input
                          className="input !py-1.5 !text-xs"
                          placeholder={t("admin.fieldBrand")}
                          value={draft.brand}
                          onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
                        />
                        <input
                          className="input !py-1.5 !text-xs"
                          placeholder={t("admin.fieldName")}
                          value={draft.name}
                          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        />
                        <select
                          className="input !py-1.5 !text-xs"
                          value={draft.category}
                          onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {CATEGORY_LABELS[c]}
                            </option>
                          ))}
                        </select>
                        <input
                          className="input !py-1.5 !text-xs"
                          placeholder={t("admin.fieldSocket")}
                          value={draft.socket}
                          onChange={(e) => setDraft((d) => ({ ...d, socket: e.target.value }))}
                        />
                        <input
                          type="number"
                          className="input !py-1.5 !text-xs"
                          placeholder={t("admin.fieldPrice")}
                          value={draft.priceMkd}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, priceMkd: Number(e.target.value) || 0 }))
                          }
                        />
                        <input
                          type="number"
                          className="input !py-1.5 !text-xs"
                          placeholder={t("admin.fieldStock")}
                          value={draft.stock}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, stock: Number(e.target.value) || 0 }))
                          }
                        />
                      </div>
                    </div>
                    <AdminImageField
                      compact
                      showPreview={false}
                      value={draft.imageUrl}
                      onChange={(url) => setDraft((d) => ({ ...d, imageUrl: url }))}
                    />
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
                      <button
                        type="button"
                        disabled={busy}
                        className="ml-auto rounded-md px-2 py-1 text-[11px] font-medium text-[var(--danger)]"
                        onClick={() => removePart(p.id, `${draft.brand} ${draft.name}`)}
                      >
                        {t("admin.remove")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!filtered.length && (
            <p className="text-sm text-[var(--text-muted)]">{t("admin.noPartsMatch")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
