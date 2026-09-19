"use client";

import { resolvePrebuiltImage } from "@/lib/partImages";
import { getPrebuiltSpecs } from "@/lib/prebuiltSpecs";
import { ProductImage } from "./ProductImage";
import { useI18n } from "./LanguageProvider";
import { useCurrency } from "./CurrencyProvider";
import type { PrebuiltCardData } from "./PrebuiltCard";

type Props = {
  pc: PrebuiltCardData | null;
  open: boolean;
  onClose: () => void;
  onBuy: () => void;
};

export function PrebuiltDetailModal({ pc, open, onClose, onBuy }: Props) {
  const { t } = useI18n();
  const { formatPrice } = useCurrency();
  if (!open || !pc) return null;

  const inStock = pc.stock > 0;
  const img = resolvePrebuiltImage(pc.slug, pc.imageUrl, pc.caseLabel);
  const specs = getPrebuiltSpecs(pc);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prebuilt-detail-title"
    >
      <div
        className="glass flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 p-4 pb-0">
          <ProductImage src={img} alt={pc.name} ratio="wide" />
          <div className="absolute left-6 top-6 z-10 flex flex-wrap gap-1.5">
            {pc.condition === "used" && (
              <span className="badge border border-[rgba(34,211,238,0.45)] bg-[rgba(7,11,18,0.85)] text-[var(--cyan)]">
                {pc.conditionGrade?.trim()
                  ? t("used.gradeBadge", { grade: pc.conditionGrade.trim() })
                  : t("used.badge")}
              </span>
            )}
            {inStock ? (
              <span className="badge badge-stock">{t("prebuilts.inStock")}</span>
            ) : (
              <span className="badge badge-out-of-stock">{t("prebuilts.outOfStock")}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-6 top-6 z-10 rounded-lg border border-[var(--border)] bg-[rgba(7,11,18,0.85)] px-2.5 py-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
            aria-label={t("prebuilts.close")}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <h2
            id="prebuilt-detail-title"
            className="section-title text-2xl text-[var(--text)]"
          >
            {pc.name}
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{pc.description}</p>
          {pc.sellerName ? (
            <p className="mt-2 text-sm text-[var(--mint)]">
              {t("sell.seller", { name: pc.sellerName })}
            </p>
          ) : null}

          <h3 className="section-title mt-6 text-sm tracking-wide text-[var(--cyan)]">
            {t("prebuilts.fullSpecs")}
          </h3>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {specs.map((row) => (
              <div
                key={row.key}
                className="rounded-xl bg-[rgba(7,11,18,0.45)] px-3.5 py-3"
              >
                <dt className="text-[11px] uppercase tracking-wider text-[var(--cyan-dim)]">
                  {row.label}
                </dt>
                <dd className="mt-1 text-sm font-medium text-[var(--text)]">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] p-4 sm:p-5">
          <p className="section-title text-2xl text-[var(--cyan)]">
            {formatPrice(pc.priceMkd)}
          </p>
          {pc.listingId ? (
            <span className="text-sm text-[var(--text-muted)]">{t("used.communityHint")}</span>
          ) : (
            <button
              type="button"
              disabled={!inStock}
              onClick={onBuy}
              className="btn btn-success !py-2.5 !text-sm"
            >
              {inStock ? t("prebuilts.buyCod") : t("prebuilts.outOfStock")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
