"use client";

import { useState } from "react";
import { useI18n } from "@/components/LanguageProvider";
import { useCurrency } from "@/components/CurrencyProvider";

export type PartSort = "name" | "price-asc" | "price-desc";

export type PartFilterState = {
  search: string;
  brand: string;
  ramType: string;
  sort: PartSort;
  priceMin: number;
  priceMax: number;
};

type Props = {
  brands: string[];
  /** When set, shows DDR4/DDR5 (etc.) chips — used on prebuilts */
  ramTypes?: string[];
  priceBounds: { min: number; max: number };
  filters: PartFilterState;
  onChange: (next: PartFilterState) => void;
  resultCount: number;
};

export function PartFilters({
  brands,
  ramTypes,
  priceBounds,
  filters,
  onChange,
  resultCount,
}: Props) {
  const { t } = useI18n();
  const { formatPrice } = useCurrency();
  const [open, setOpen] = useState(false);
  const span = Math.max(priceBounds.max - priceBounds.min, 1);

  function patch(partial: Partial<PartFilterState>) {
    onChange({ ...filters, ...partial });
  }

  function reset() {
    onChange({
      search: "",
      brand: "",
      ramType: "",
      sort: "price-asc",
      priceMin: priceBounds.min,
      priceMax: priceBounds.max,
    });
  }

  const advancedActive =
    filters.brand !== "" ||
    filters.ramType !== "" ||
    filters.sort !== "price-asc" ||
    filters.priceMin > priceBounds.min ||
    filters.priceMax < priceBounds.max;

  const hasActive = filters.search.trim() !== "" || advancedActive;

  const advancedCount =
    (filters.brand !== "" ? 1 : 0) +
    (filters.ramType !== "" ? 1 : 0) +
    (filters.sort !== "price-asc" ? 1 : 0) +
    (filters.priceMin > priceBounds.min || filters.priceMax < priceBounds.max ? 1 : 0);

  const brandSortPrice = (
    <>
      <fieldset>
        <legend className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {t("builder.filterBrand")}
        </legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => patch({ brand: "" })}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
              filters.brand === ""
                ? "bg-[var(--cyan)] text-[#041018]"
                : "bg-[rgba(34,211,238,0.08)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {t("builder.filterAll")}
          </button>
          {brands.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => patch({ brand: b })}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                filters.brand === b
                  ? "bg-[var(--cyan)] text-[#041018]"
                  : "bg-[rgba(34,211,238,0.08)] text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </fieldset>

      {ramTypes && ramTypes.length > 0 && (
        <fieldset className="mt-4">
          <legend className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {t("builder.filterRam")}
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => patch({ ramType: "" })}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                filters.ramType === ""
                  ? "bg-[var(--cyan)] text-[#041018]"
                  : "bg-[rgba(34,211,238,0.08)] text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {t("builder.filterAll")}
            </button>
            {ramTypes.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => patch({ ramType: r })}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  filters.ramType === r
                    ? "bg-[var(--cyan)] text-[#041018]"
                    : "bg-[rgba(34,211,238,0.08)] text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <label className="mt-4 block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {t("builder.filterSort")}
        </span>
        <select
          value={filters.sort}
          onChange={(e) => patch({ sort: e.target.value as PartSort })}
          className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[rgba(7,11,18,0.55)] px-3 py-2 text-sm outline-none transition focus:border-[var(--cyan)]"
        >
          <option value="name">{t("builder.filterSortName")}</option>
          <option value="price-asc">{t("builder.filterSortCheap")}</option>
          <option value="price-desc">{t("builder.filterSortExpensive")}</option>
        </select>
      </label>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {t("builder.filterPrice")}
          </span>
          <span className="text-[11px] text-[var(--cyan-dim)]">
            {formatPrice(filters.priceMin)} – {formatPrice(filters.priceMax)}
          </span>
        </div>

        <div className="relative mt-4 h-6">
          <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[rgba(34,211,238,0.12)]" />
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--cyan)]/50"
            style={{
              left: `${((filters.priceMin - priceBounds.min) / span) * 100}%`,
              right: `${((priceBounds.max - filters.priceMax) / span) * 100}%`,
            }}
          />
          <input
            type="range"
            min={priceBounds.min}
            max={priceBounds.max}
            step={100}
            value={filters.priceMin}
            onChange={(e) => {
              const v = Number(e.target.value);
              patch({ priceMin: Math.min(v, filters.priceMax) });
            }}
            className="absolute inset-0 w-full appearance-none bg-transparent accent-[var(--cyan)] [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20"
            aria-label={t("builder.filterPriceMin")}
          />
          <input
            type="range"
            min={priceBounds.min}
            max={priceBounds.max}
            step={100}
            value={filters.priceMax}
            onChange={(e) => {
              const v = Number(e.target.value);
              patch({ priceMax: Math.max(v, filters.priceMin) });
            }}
            className="absolute inset-0 w-full appearance-none bg-transparent accent-[var(--cyan)] [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-30"
            aria-label={t("builder.filterPriceMax")}
          />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="sr-only">{t("builder.filterPriceMin")}</span>
            <input
              type="number"
              min={priceBounds.min}
              max={filters.priceMax}
              value={filters.priceMin}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isNaN(v)) return;
                patch({
                  priceMin: Math.min(Math.max(v, priceBounds.min), filters.priceMax),
                });
              }}
              className="w-full rounded-lg border border-[var(--border)] bg-[rgba(7,11,18,0.55)] px-2 py-1.5 text-xs outline-none focus:border-[var(--cyan)]"
            />
          </label>
          <label className="block">
            <span className="sr-only">{t("builder.filterPriceMax")}</span>
            <input
              type="number"
              min={filters.priceMin}
              max={priceBounds.max}
              value={filters.priceMax}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isNaN(v)) return;
                patch({
                  priceMax: Math.max(Math.min(v, priceBounds.max), filters.priceMin),
                });
              }}
              className="w-full rounded-lg border border-[var(--border)] bg-[rgba(7,11,18,0.55)] px-2 py-1.5 text-xs outline-none focus:border-[var(--cyan)]"
            />
          </label>
        </div>
      </div>
    </>
  );

  return (
    <aside className="glass rounded-2xl p-3.5 lg:sticky lg:top-20 lg:self-start">
      {/* Mobile: search + filter dropdown */}
      <div className="lg:hidden">
        <div className="flex gap-2">
          <input
            type="search"
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            placeholder={t("builder.filterSearchPlaceholder")}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[rgba(7,11,18,0.55)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--cyan)]"
            aria-label={t("builder.filterSearch")}
          />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-medium transition ${
              open || advancedActive
                ? "border-[var(--cyan)] bg-[rgba(34,211,238,0.12)] text-[var(--cyan)]"
                : "border-[var(--border)] text-[var(--text-muted)]"
            }`}
          >
            {t("builder.filters")}
            {advancedCount > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--cyan)] px-1 text-[10px] font-semibold text-[#041018]">
                {advancedCount}
              </span>
            )}
            <span className={`text-[10px] transition ${open ? "rotate-180" : ""}`} aria-hidden>
              ▾
            </span>
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-[var(--text-muted)]">
            {t("builder.filterResults", { count: resultCount })}
          </p>
          {hasActive && (
            <button
              type="button"
              onClick={reset}
              className="text-[11px] font-medium text-[var(--cyan)] hover:underline"
            >
              {t("builder.filterReset")}
            </button>
          )}
        </div>

        {open && <div className="mt-3 border-t border-[var(--border)] pt-3">{brandSortPrice}</div>}
      </div>

      {/* Desktop: full panel */}
      <div className="hidden lg:block">
        <div className="flex items-center justify-between gap-2">
          <h3 className="section-title text-base">{t("builder.filters")}</h3>
          {hasActive && (
            <button
              type="button"
              onClick={reset}
              className="text-[11px] font-medium text-[var(--cyan)] hover:underline"
            >
              {t("builder.filterReset")}
            </button>
          )}
        </div>

        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          {t("builder.filterResults", { count: resultCount })}
        </p>

        <label className="mt-4 block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {t("builder.filterSearch")}
          </span>
          <input
            type="search"
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            placeholder={t("builder.filterSearchPlaceholder")}
            className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[rgba(7,11,18,0.55)] px-3 py-2 text-sm outline-none transition focus:border-[var(--cyan)]"
          />
        </label>

        <div className="mt-4">{brandSortPrice}</div>
      </div>
    </aside>
  );
}
