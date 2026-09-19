"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminImageField } from "@/components/AdminImageField";
import { ProductImage } from "@/components/ProductImage";
import { useI18n } from "@/components/LanguageProvider";
import { useCurrency } from "@/components/CurrencyProvider";
import { fetchSessionUser, loginUrl, type ClientUser } from "@/lib/clientAuth";
import { LISTING_CATEGORIES, type ListingCategory } from "@/lib/listingCategories";
import { proxiedExternalImage } from "@/lib/partImages";

export type SellListing = {
  id: string;
  name: string;
  category: string;
  description: string;
  priceMkd: number;
  imageUrl: string | null;
  status: string;
  createdAt: string;
  sellerId: string;
  sellerName: string;
  cpuLabel?: string;
  coolerLabel?: string;
  motherboardLabel?: string;
  ramLabel?: string;
  gpuLabel?: string;
  ssdLabel?: string;
  psuLabel?: string;
  caseLabel?: string;
};

const PC_SPEC_FIELDS = [
  { key: "cpuLabel", labelKey: "admin.fieldCpu", placeholder: "e.g. Ryzen 5 5600" },
  { key: "coolerLabel", labelKey: "admin.fieldCooler", placeholder: "e.g. Peerless Assassin" },
  { key: "motherboardLabel", labelKey: "admin.fieldMotherboard", placeholder: "e.g. B550M DS3H" },
  { key: "ramLabel", labelKey: "admin.fieldRam", placeholder: "e.g. 32GB DDR4 3200" },
  { key: "gpuLabel", labelKey: "admin.fieldGpu", placeholder: "e.g. RTX 3060 12GB" },
  { key: "ssdLabel", labelKey: "admin.fieldSsd", placeholder: "e.g. 1TB NVMe" },
  { key: "psuLabel", labelKey: "admin.fieldPsu", placeholder: "e.g. 650W 80+ Bronze" },
  { key: "caseLabel", labelKey: "admin.fieldCase", placeholder: "e.g. Lian Li Lancool 216" },
] as const;

type PcSpecKey = (typeof PC_SPEC_FIELDS)[number]["key"];

const emptyForm = {
  name: "",
  category: "PC" as ListingCategory,
  priceMkd: "",
  imageUrl: "",
  description: "",
  cpuLabel: "",
  coolerLabel: "",
  motherboardLabel: "",
  ramLabel: "",
  gpuLabel: "",
  ssdLabel: "",
  psuLabel: "",
  caseLabel: "",
};

function categoryLabel(
  t: (key: string, vars?: Record<string, string | number>) => string,
  category: string,
) {
  const key = `sell.cat.${category}`;
  const label = t(key);
  return label === key ? category : label;
}

function statusLabel(
  t: (key: string, vars?: Record<string, string | number>) => string,
  status: string,
) {
  const key = `sell.status.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

export function SellMarketplace() {
  const { t } = useI18n();
  const [user, setUser] = useState<ClientUser | null | undefined>(undefined);
  const [form, setForm] = useState(emptyForm);
  const [mine, setMine] = useState<SellListing[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadMine() {
    const res = await fetch("/api/sell?mine=1");
    if (!res.ok) return;
    const data = await res.json();
    setMine(data.items ?? []);
  }

  useEffect(() => {
    void fetchSessionUser().then((u) => {
      setUser(u);
      if (u) void loadMine();
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const price = Number(String(form.priceMkd).replace(/[^\d]/g, ""));
      if (!Number.isFinite(price) || price < 1) {
        setError(t("sell.invalidPrice"));
        return;
      }
      if (form.name.trim().length < 2) {
        setError(t("sell.createFailed"));
        return;
      }
      if (form.category === "PC") {
        const missing = PC_SPEC_FIELDS.filter((f) => !form[f.key].trim());
        if (missing.length) {
          setError(t("sell.pcSpecsRequired"));
          return;
        }
      }
      const res = await fetch("/api/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          category: form.category,
          priceMkd: Math.round(price),
          imageUrl: form.imageUrl.trim() || null,
          description: form.description.trim() || null,
          cpuLabel: form.cpuLabel.trim(),
          coolerLabel: form.coolerLabel.trim(),
          motherboardLabel: form.motherboardLabel.trim(),
          ramLabel: form.ramLabel.trim(),
          gpuLabel: form.gpuLabel.trim(),
          ssdLabel: form.ssdLabel.trim(),
          psuLabel: form.psuLabel.trim(),
          caseLabel: form.caseLabel.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          setError(t("sell.loginRequired"));
          return;
        }
        setError(data.error || t("sell.createFailed"));
        return;
      }
      setForm(emptyForm);
      setSuccess(t("sell.created"));
      await loadMine();
    } catch {
      setError(t("sell.createFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: "sold" | "pending") {
    const res = await fetch(`/api/sell/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return;
    await loadMine();
  }

  async function remove(id: string) {
    if (!window.confirm(t("sell.deleteConfirm"))) return;
    const res = await fetch(`/api/sell/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    await loadMine();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="section-title text-3xl text-[var(--cyan)] md:text-4xl">
            {t("sell.title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">{t("sell.desc")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/used" className="btn btn-ghost !text-sm">
            {t("sell.browseUsedPcs")}
          </Link>
          <Link href="/used-parts" className="btn btn-ghost !text-sm">
            {t("sell.browseUsedParts")}
          </Link>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="glass rounded-2xl p-5 sm:p-6">
          <h2 className="section-title text-xl text-[var(--text)]">{t("sell.formTitle")}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t("sell.formHint")}</p>

          {user === undefined ? (
            <p className="mt-6 text-sm text-[var(--text-muted)]">{t("sell.loading")}</p>
          ) : !user ? (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-[var(--mint)]">{t("sell.loginRequired")}</p>
              <Link href={loginUrl("/sell")} className="btn btn-primary inline-flex">
                {t("nav.login")}
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label className="label">{t("sell.fieldName")}</label>
                <input
                  className="input"
                  required
                  minLength={2}
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t("sell.namePlaceholder")}
                />
              </div>

              <div>
                <label className="label">{t("sell.fieldCategory")}</label>
                <select
                  className="input"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value as ListingCategory })
                  }
                >
                  {LISTING_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {categoryLabel(t, cat)}
                    </option>
                  ))}
                </select>
              </div>

              {form.category === "PC" && (
                <div className="space-y-3 rounded-xl border border-[rgba(34,211,238,0.2)] bg-[rgba(7,11,18,0.35)] p-3 sm:p-4">
                  <p className="text-sm text-[var(--text-muted)]">{t("sell.pcSpecsHint")}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {PC_SPEC_FIELDS.map((field) => (
                      <div key={field.key}>
                        <label className="label">{t(field.labelKey)}</label>
                        <input
                          className="input"
                          required
                          maxLength={120}
                          value={form[field.key as PcSpecKey]}
                          onChange={(e) =>
                            setForm({ ...form, [field.key]: e.target.value })
                          }
                          placeholder={field.placeholder}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="label">{t("sell.fieldPrice")}</label>
                <input
                  className="input"
                  required
                  inputMode="numeric"
                  value={form.priceMkd}
                  onChange={(e) => setForm({ ...form, priceMkd: e.target.value })}
                  placeholder="e.g. 25000"
                />
              </div>

              <div>
                <label className="label">{t("sell.fieldImage")}</label>
                <AdminImageField
                  value={form.imageUrl}
                  onChange={(url) => setForm({ ...form, imageUrl: url })}
                  uploadUrl="/api/sell/upload"
                  previewAlt={form.name || "listing"}
                />
              </div>

              <div>
                <label className="label">{t("sell.fieldDescription")}</label>
                <textarea
                  className="input min-h-[5rem] resize-y"
                  maxLength={2000}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder={t("sell.descPlaceholder")}
                />
              </div>

              {error && <p className="text-sm text-[var(--danger,#f87171)]">{error}</p>}
              {success && <p className="text-sm text-[var(--mint)]">{success}</p>}

              <button type="submit" disabled={saving} className="btn btn-primary w-full sm:w-auto">
                {saving ? t("sell.saving") : t("sell.submit")}
              </button>
            </form>
          )}
        </section>

        <section>
          <h2 className="section-title text-xl text-[var(--text)]">{t("sell.myListings")}</h2>
          {!user ? (
            <p className="mt-3 text-sm text-[var(--text-muted)]">{t("sell.loginRequired")}</p>
          ) : mine.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--text-muted)]">{t("sell.noMine")}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {mine.map((item) => (
                <ListingRow
                  key={item.id}
                  item={item}
                  t={t}
                  onSold={() => void setStatus(item.id, "sold")}
                  onResubmit={() => void setStatus(item.id, "pending")}
                  onDelete={() => void remove(item.id)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ListingRow({
  item,
  t,
  onSold,
  onResubmit,
  onDelete,
}: {
  item: SellListing;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onSold?: () => void;
  onResubmit?: () => void;
  onDelete?: () => void;
}) {
  const { formatPrice } = useCurrency();
  const img = item.imageUrl?.trim()
    ? proxiedExternalImage(item.imageUrl.trim())
    : null;

  return (
    <li className="glass flex gap-3 rounded-xl p-3">
      <div className="w-20 shrink-0">
        {img ? (
          <ProductImage src={img} alt={item.name} ratio="square" className="!rounded-lg" />
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-lg bg-[rgba(7,11,18,0.45)] text-xs text-[var(--text-muted)]">
            —
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-medium text-[var(--text)]">{item.name}</h3>
          <span className="badge border border-[rgba(34,211,238,0.35)] text-[var(--cyan)]">
            {categoryLabel(t, item.category)}
          </span>
          <span className="badge border border-[rgba(255,255,255,0.15)] text-[var(--text-muted)]">
            {statusLabel(t, item.status)}
          </span>
        </div>
        <p className="mt-1 section-title text-lg text-[var(--cyan)]">{formatPrice(item.priceMkd)}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {item.status === "active" && (
            <button type="button" className="btn btn-ghost !px-2.5 !py-1.5 !text-xs" onClick={onSold}>
              {t("sell.markSold")}
            </button>
          )}
          {(item.status === "sold" || item.status === "rejected") && (
            <button
              type="button"
              className="btn btn-ghost !px-2.5 !py-1.5 !text-xs"
              onClick={onResubmit}
            >
              {t("sell.resubmit")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost !px-2.5 !py-1.5 !text-xs text-[var(--danger,#f87171)]"
            onClick={onDelete}
          >
            {t("sell.delete")}
          </button>
        </div>
      </div>
    </li>
  );
}
