"use client";

import { useCallback, useEffect, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { useI18n } from "@/components/LanguageProvider";
import { proxiedExternalImage } from "@/lib/partImages";

type AdminListing = {
  id: string;
  name: string;
  category: string;
  description: string;
  priceMkd: number;
  imageUrl: string | null;
  status: string;
  createdAt: string;
  sellerName: string;
  sellerEmail: string;
  sellerPhone: string | null;
};

export function AdminListings({ onMessage }: { onMessage?: (msg: string) => void }) {
  const { t } = useI18n();
  const [items, setItems] = useState<AdminListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [prices, setPrices] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/listings");
      const data = await res.json();
      if (!res.ok) {
        onMessage?.(data.error || t("admin.listingsError"));
        return;
      }
      setItems(data.items ?? []);
    } catch {
      onMessage?.(t("admin.listingsError"));
    } finally {
      setLoading(false);
    }
  }, [onMessage, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(
    id: string,
    status: "active" | "rejected" | "hidden",
    priceMkd?: number,
  ) {
    const res = await fetch("/api/admin/listings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        status,
        ...(priceMkd !== undefined ? { priceMkd } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      onMessage?.(data.error || t("admin.listingsError"));
      return;
    }
    onMessage?.(
      status === "active"
        ? t("admin.listingApproved")
        : status === "rejected"
          ? t("admin.listingRejected")
          : t("admin.listingHidden"),
    );
    await load();
  }

  async function removeListing(id: string, name: string) {
    if (!window.confirm(t("admin.listingDeleteConfirm", { name }))) return;
    const res = await fetch("/api/admin/listings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      onMessage?.(data.error || t("admin.listingDeleteError"));
      return;
    }
    onMessage?.(t("admin.listingDeleted"));
    await load();
  }

  function priceValue(item: AdminListing) {
    return prices[item.id] ?? String(item.priceMkd);
  }

  function parsedPrice(item: AdminListing): number | null {
    const priceMkd = Number(priceValue(item));
    if (!Number.isInteger(priceMkd) || priceMkd < 1) return null;
    return priceMkd;
  }

  async function savePrice(item: AdminListing) {
    const priceMkd = parsedPrice(item);
    if (priceMkd == null) {
      onMessage?.(t("admin.priceInvalid"));
      return;
    }
    const res = await fetch("/api/admin/listings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, priceMkd }),
    });
    const data = await res.json();
    if (!res.ok) {
      onMessage?.(data.error || t("admin.listingsError"));
      return;
    }
    onMessage?.(t("admin.priceSaved"));
    await load();
  }

  async function approve(item: AdminListing) {
    const priceMkd = parsedPrice(item);
    if (priceMkd == null) {
      onMessage?.(t("admin.priceInvalid"));
      return;
    }
    await setStatus(item.id, "active", priceMkd);
  }

  const visible = items.filter((item) => (filter === "pending" ? item.status === "pending" : true));
  const pendingCount = items.filter((i) => i.status === "pending").length;

  function categoryLabel(category: string) {
    const key = `sell.cat.${category}`;
    const label = t(key);
    return label === key ? category : label;
  }

  function statusLabel(status: string) {
    const key = `sell.status.${status}`;
    const label = t(key);
    return label === key ? status : label;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title text-xl">{t("admin.listingsTitle")}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t("admin.listingsHint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter("pending")}
            className={`rounded-lg px-3 py-1.5 text-xs ${
              filter === "pending"
                ? "bg-[var(--cyan)] text-[#041018]"
                : "bg-[rgba(34,211,238,0.06)] text-[var(--text-muted)]"
            }`}
          >
            {t("admin.listingsPending")} ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-xs ${
              filter === "all"
                ? "bg-[var(--cyan)] text-[#041018]"
                : "bg-[rgba(34,211,238,0.06)] text-[var(--text-muted)]"
            }`}
          >
            {t("admin.listingsAll")}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">{t("admin.loading")}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{t("admin.listingsEmpty")}</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => {
            const img = item.imageUrl?.trim()
              ? proxiedExternalImage(item.imageUrl.trim())
              : null;
            return (
              <li key={item.id} className="glass flex flex-col gap-3 rounded-xl p-4 sm:flex-row">
                <div className="w-full shrink-0 sm:w-28">
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
                    <h3 className="font-medium text-[var(--text)]">{item.name}</h3>
                    <span className="badge border border-[rgba(34,211,238,0.35)] text-[var(--cyan)]">
                      {categoryLabel(item.category)}
                    </span>
                    <span className="badge border border-[rgba(255,255,255,0.15)] text-[var(--text-muted)]">
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="text-xs text-[var(--text-muted)]" htmlFor={`price-${item.id}`}>
                      {t("admin.colPrice")}
                    </label>
                    <input
                      id={`price-${item.id}`}
                      type="number"
                      min={1}
                      className="input w-32 !py-1.5 !text-sm"
                      value={priceValue(item)}
                      onChange={(e) =>
                        setPrices((current) => ({ ...current, [item.id]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-ghost !px-3 !py-1.5 !text-xs"
                      onClick={() => void savePrice(item)}
                    >
                      {t("admin.savePrice")}
                    </button>
                  </div>
                  {item.description ? (
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{item.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    {item.sellerName} · {item.sellerEmail}
                    {item.sellerPhone ? ` · ${item.sellerPhone}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.status === "pending" && (
                      <>
                        <button
                          type="button"
                          className="btn btn-success !px-3 !py-1.5 !text-xs"
                          onClick={() => void approve(item)}
                        >
                          {t("admin.approveListing")}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost !px-3 !py-1.5 !text-xs text-[var(--danger,#f87171)]"
                          onClick={() => void setStatus(item.id, "rejected")}
                        >
                          {t("admin.rejectListing")}
                        </button>
                      </>
                    )}
                    {item.status === "active" && (
                      <button
                        type="button"
                        className="btn btn-ghost !px-3 !py-1.5 !text-xs"
                        onClick={() => void setStatus(item.id, "hidden")}
                      >
                        {t("admin.hideListing")}
                      </button>
                    )}
                    {item.status === "rejected" && (
                      <button
                        type="button"
                        className="btn btn-success !px-3 !py-1.5 !text-xs"
                        onClick={() => void approve(item)}
                      >
                        {t("admin.approveListing")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost !px-3 !py-1.5 !text-xs text-[var(--danger,#f87171)]"
                      onClick={() => void removeListing(item.id, item.name)}
                    >
                      {t("admin.deleteListing")}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
