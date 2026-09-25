"use client";

import Link from "next/link";
import { resolvePrebuiltImage } from "@/lib/partImages";
import { ProductImage } from "./ProductImage";
import { useI18n } from "./LanguageProvider";
import { useCurrency } from "./CurrencyProvider";

export type PrebuiltCardData = {
  id: string;
  slug: string;
  name: string;
  description: string;
  cpuLabel: string;
  coolerLabel?: string | null;
  motherboardLabel?: string | null;
  ramLabel: string;
  gpuLabel: string;
  ssdLabel: string;
  psuLabel?: string | null;
  caseLabel?: string | null;
  priceMkd: number;
  stock: number;
  deliveryHours: number;
  imageUrl?: string | null;
  condition?: string | null;
  conditionGrade?: string | null;
  /** Community sell listing (category PC) — shown on /used */
  listingId?: string | null;
  sellerName?: string | null;
};

export function PrebuiltCard({
  pc,
  onOpen,
  onBuy,
  buyBasePath = "/prebuilts",
}: {
  pc: PrebuiltCardData;
  onOpen?: () => void;
  onBuy?: (id: string) => void;
  buyBasePath?: string;
}) {
  const { t } = useI18n();
  const { formatPrice } = useCurrency();
  const inStock = pc.stock > 0;
  const img = resolvePrebuiltImage(pc.slug, pc.imageUrl, pc.caseLabel);

  return (
    <article
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      className={`glass group flex flex-col overflow-hidden rounded-2xl transition duration-300 hover:border-[var(--border-strong)] hover:shadow-[0_0_40px_rgba(34,211,238,0.12)] ${
        onOpen ? "cursor-pointer" : ""
      } ${!inStock ? "opacity-80" : ""}`}
    >
      <div className="relative p-3 pb-0">
        <ProductImage src={img} alt={pc.name} ratio="wide" />
        <div className="absolute left-5 top-5 z-10 flex flex-wrap gap-1.5">
          {pc.condition === "used" && (
            <span className="badge border border-[rgba(34,211,238,0.45)] bg-[rgba(7,11,18,0.85)] text-[var(--cyan)]">
              {pc.conditionGrade?.trim()
                ? t("used.gradeBadge", { grade: pc.conditionGrade.trim() })
                : t("used.badge")}
            </span>
          )}
          {pc.listingId && (
            <span className="badge border border-[rgba(52,211,153,0.45)] bg-[rgba(7,11,18,0.85)] text-[var(--mint)]">
              {t("used.community")}
            </span>
          )}
          {inStock ? (
            <span className="badge badge-stock">{t("prebuilts.inStock")}</span>
          ) : (
            <span className="badge badge-out-of-stock">{t("prebuilts.outOfStock")}</span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="section-title text-lg text-[var(--text)]">{pc.name}</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)] line-clamp-2">{pc.description}</p>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-xs">
          {[
            ["CPU", pc.cpuLabel],
            ["GPU", pc.gpuLabel],
            ["RAM", pc.ramLabel],
            ["SSD", pc.ssdLabel],
          ]
            .filter(([, v]) => Boolean(v?.trim()))
            .map(([k, v]) => (
            <div key={k} className="rounded-lg bg-[rgba(7,11,18,0.45)] px-2.5 py-2">
              <dt className="text-[var(--cyan-dim)]">{k}</dt>
              <dd className="mt-0.5 font-medium text-[var(--text)]">{v}</dd>
            </div>
          ))}
        </dl>

        {pc.sellerName ? (
          <p className="text-xs text-[var(--text-muted)]">
            {t("sell.seller", { name: pc.sellerName })}
          </p>
        ) : null}

        {onOpen && (
          <p className="text-xs text-[var(--cyan-dim)] group-hover:text-[var(--cyan)]">
            {t("prebuilts.viewSpecs")} →
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <p className="section-title text-xl text-[var(--cyan)]">{formatPrice(pc.priceMkd)}</p>
          <div className="flex items-center gap-2">
          {!pc.listingId ? (
            <Link
              href={`/configurator?edit=${encodeURIComponent(pc.slug)}`}
              onClick={(e) => e.stopPropagation()}
              className="btn btn-ghost !py-2 !text-xs"
            >
              {t("prebuilts.edit")}
            </Link>
          ) : null}
          {onBuy && !pc.listingId ? (
            <button
              type="button"
              disabled={!inStock}
              onClick={(e) => {
                e.stopPropagation();
                onBuy(pc.id);
              }}
              className="btn btn-success !py-2 !text-xs"
            >
              {inStock ? t("prebuilts.buyCod") : t("prebuilts.outOfStock")}
            </button>
          ) : pc.listingId ? (
            <span className="text-xs text-[var(--mint)]">{t("used.community")}</span>
          ) : (
            <Link
              href={`${buyBasePath}?buy=${pc.slug}`}
              onClick={(e) => e.stopPropagation()}
              className={`btn btn-success !py-2 !text-xs ${!inStock ? "pointer-events-none opacity-45" : ""}`}
            >
              {inStock ? t("prebuilts.buyCod") : t("prebuilts.outOfStock")}
            </Link>
          )}
          </div>
        </div>
      </div>
    </article>
  );
}
