"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProductImage } from "@/components/ProductImage";
import { useI18n } from "@/components/LanguageProvider";
import { useCurrency } from "@/components/CurrencyProvider";
import { PART_LISTING_CATEGORIES } from "@/lib/listingCategories";
import { proxiedExternalImage } from "@/lib/partImages";
import type { SellListing } from "@/components/SellMarketplace";

function categoryLabel(
  t: (key: string, vars?: Record<string, string | number>) => string,
  category: string,
) {
  const key = `sell.cat.${category}`;
  const label = t(key);
  return label === key ? category : label;
}

export function UsedPartsCatalog() {
  const { t } = useI18n();
  const { formatPrice } = useCurrency();
  const [items, setItems] = useState<SellListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");

  useEffect(() => {
    setLoading(true);
    const q = category ? `?category=${encodeURIComponent(category)}` : "?partsOnly=1";
    fetch(`/api/sell${q}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [category]);

  const filters = useMemo(
    () => [
      { value: "", label: t("usedParts.filterAll") },
      ...PART_LISTING_CATEGORIES.map((c) => ({
        value: c,
        label: categoryLabel(t, c),
      })),
    ],
    [t],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="section-title text-3xl text-[var(--cyan)] md:text-4xl">
            {t("usedParts.title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">{t("usedParts.desc")}</p>
        </div>
        <Link href="/sell" className="btn btn-primary !text-sm">
          {t("usedParts.sellCta")}
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.value || "all"}
            type="button"
            onClick={() => setCategory(f.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              category === f.value
                ? "bg-[rgba(34,211,238,0.15)] text-[var(--cyan)]"
                : "bg-[rgba(34,211,238,0.05)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">{t("usedParts.loading")}</p>
      ) : items.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-[var(--text-muted)]">{t("usedParts.empty")}</p>
          <Link href="/sell" className="btn btn-ghost mt-4 inline-flex !text-sm">
            {t("usedParts.sellCta")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const img = item.imageUrl?.trim()
              ? proxiedExternalImage(item.imageUrl.trim())
              : null;
            return (
              <article key={item.id} className="glass flex flex-col overflow-hidden rounded-2xl">
                <div className="p-3 pb-0">
                  {img ? (
                    <ProductImage src={img} alt={item.name} ratio="wide" />
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-white/5 text-sm text-[var(--text-muted)]">
                      {t("sell.noImage")}
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <span className="badge w-fit border border-[rgba(34,211,238,0.35)] text-[var(--cyan)]">
                    {categoryLabel(t, item.category)}
                  </span>
                  <h3 className="section-title text-lg text-[var(--text)]">{item.name}</h3>
                  {item.description ? (
                    <p className="line-clamp-2 text-sm text-[var(--text-muted)]">{item.description}</p>
                  ) : null}
                  <p className="text-xs text-[var(--text-muted)]">
                    {t("sell.seller", { name: item.sellerName })}
                  </p>
                  <p className="mt-auto section-title text-xl text-[var(--cyan)]">
                    {formatPrice(item.priceMkd)}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
