"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PrebuiltCard, type PrebuiltCardData } from "@/components/PrebuiltCard";
import { PrebuiltDetailModal } from "@/components/PrebuiltDetailModal";
import { CheckoutModal } from "@/components/CheckoutModal";
import { PartFilters, type PartFilterState } from "@/components/PartFilters";
import { rememberTrackingCode } from "@/components/LiveBuildPipeline";
import { useI18n } from "@/components/LanguageProvider";
import { fetchSessionUser, loginUrl } from "@/lib/clientAuth";

function gpuBrand(pc: PrebuiltCardData): string {
  const g = `${pc.gpuLabel} ${pc.cpuLabel}`.toLowerCase();
  if (g.includes("rtx") || g.includes("geforce") || g.includes("gt ")) return "NVIDIA";
  if (g.includes("radeon") || g.includes("rx ") || g.includes("vega")) return "AMD";
  if (g.includes("intel") || g.includes("uhd") || g.includes("arc")) return "Intel";
  return "Other";
}

function ramTypeOf(pc: PrebuiltCardData): string {
  const r = (pc.ramLabel || "").toLowerCase();
  if (r.includes("ddr5")) return "DDR5";
  if (r.includes("ddr4")) return "DDR4";
  return "";
}

function matchesSearch(pc: PrebuiltCardData, q: string): boolean {
  if (!q) return true;
  const hay = [
    pc.name,
    pc.description,
    pc.cpuLabel,
    pc.coolerLabel,
    pc.motherboardLabel,
    pc.ramLabel,
    pc.gpuLabel,
    pc.ssdLabel,
    pc.psuLabel,
    pc.caseLabel,
    pc.conditionGrade,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function CatalogInner({
  condition,
  basePath,
  titleKey,
  descKey,
}: {
  condition: "new" | "used";
  basePath: string;
  titleKey: string;
  descKey: string;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<PrebuiltCardData[]>([]);
  const [detail, setDetail] = useState<PrebuiltCardData | null>(null);
  const [checkout, setCheckout] = useState<PrebuiltCardData | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filters, setFilters] = useState<PartFilterState | null>(null);
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const storeRes = await fetch(`/api/prebuilts?condition=${condition}`);
      const storeData = await storeRes.json();
      const storeItems: PrebuiltCardData[] = storeData.items ?? [];

      if (condition !== "used") {
        if (!cancelled) setItems(storeItems);
        return;
      }

      // Community "Sell PC" listings appear on Used PCs after admin approval
      try {
        const listRes = await fetch("/api/sell?category=PC");
        const listData = await listRes.json();
        const community: PrebuiltCardData[] = (listData.items ?? []).map(
          (l: {
            id: string;
            name: string;
            description?: string;
            priceMkd: number;
            imageUrl?: string | null;
            sellerName?: string;
            cpuLabel?: string;
            coolerLabel?: string;
            motherboardLabel?: string;
            ramLabel?: string;
            gpuLabel?: string;
            ssdLabel?: string;
            psuLabel?: string;
            caseLabel?: string;
          }) => ({
            id: `listing:${l.id}`,
            slug: `community-${l.id}`,
            name: l.name,
            description: l.description?.trim() || "",
            cpuLabel: l.cpuLabel?.trim() || "",
            coolerLabel: l.coolerLabel?.trim() || "",
            motherboardLabel: l.motherboardLabel?.trim() || "",
            ramLabel: l.ramLabel?.trim() || "",
            gpuLabel: l.gpuLabel?.trim() || "",
            ssdLabel: l.ssdLabel?.trim() || "",
            psuLabel: l.psuLabel?.trim() || "",
            caseLabel: l.caseLabel?.trim() || "",
            priceMkd: l.priceMkd,
            stock: 1,
            deliveryHours: 24,
            imageUrl: l.imageUrl ?? null,
            condition: "used",
            conditionGrade: "",
            listingId: l.id,
            sellerName: l.sellerName ?? null,
          }),
        );
        if (!cancelled) setItems([...storeItems, ...community]);
      } catch {
        if (!cancelled) setItems(storeItems);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [condition]);

  const priceBounds = useMemo(() => {
    if (!items.length) return { min: 0, max: 0 };
    const prices = items.map((p) => p.priceMkd);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [items]);

  useEffect(() => {
    if (!items.length) return;
    setFilters({
      search: "",
      brand: "",
      ramType: "",
      sort: "price-asc",
      priceMin: priceBounds.min,
      priceMax: priceBounds.max,
    });
  }, [items, priceBounds.min, priceBounds.max]);

  const brands = useMemo(() => {
    const set = new Set(items.map(gpuBrand).filter((b) => b !== "Other"));
    return ["NVIDIA", "AMD", "Intel"].filter((b) => set.has(b));
  }, [items]);

  const filtered = useMemo(() => {
    if (!filters) return items;
    const q = filters.search.trim().toLowerCase();
    let list = items.filter((pc) => {
      if (!matchesSearch(pc, q)) return false;
      if (filters.brand && gpuBrand(pc) !== filters.brand) return false;
      if (filters.ramType && ramTypeOf(pc) !== filters.ramType) return false;
      if (pc.priceMkd < filters.priceMin || pc.priceMkd > filters.priceMax) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (filters.sort === "name") return a.name.localeCompare(b.name);
      if (filters.sort === "price-desc") return b.priceMkd - a.priceMkd;
      return a.priceMkd - b.priceMkd;
    });
    return list;
  }, [items, filters]);

  useEffect(() => {
    const buy = params.get("buy");
    const view = params.get("view");
    if (!items.length) return;

    if (buy) {
      const match = items.find((i) => i.slug === buy);
      if (!match) return;
      if (match.listingId || match.stock <= 0) {
        setDetail(match);
        return;
      }
      let cancelled = false;
      fetchSessionUser().then((user) => {
        if (cancelled) return;
        if (!user) {
          router.replace(loginUrl(`${basePath}?buy=${match.slug}`));
          return;
        }
        setDetail(null);
        setCheckout(match);
      });
      return () => {
        cancelled = true;
      };
    }

    if (view) {
      const match = items.find((i) => i.slug === view);
      if (match) setDetail(match);
    }
  }, [params, items, router, basePath]);

  async function requireLoginThenBuy(pc: PrebuiltCardData) {
    if (pc.listingId) {
      setDetail(pc);
      return;
    }
    if (pc.stock <= 0) {
      setDetail(pc);
      return;
    }
    const user = await fetchSessionUser();
    if (!user) {
      router.push(loginUrl(`${basePath}?buy=${pc.slug}`));
      return;
    }
    setDetail(null);
    setCheckout(pc);
  }

  async function submitOrder(data: {
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    customerAddress: string;
    city: string;
  }) {
    if (!checkout || checkout.listingId) return;
    const user = await fetchSessionUser();
    if (!user) {
      router.push(loginUrl(`${basePath}?buy=${checkout.slug}`));
      return;
    }
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "PREBUILT",
        prebuiltId: checkout.id,
        ...data,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error");
    rememberTrackingCode(json.order.trackingCode, {
      status: json.order.status,
      type: "PREBUILT",
      label: checkout.name,
      totalMkd: json.order.totalMkd,
    });
    setCheckout(null);
    setDetail(null);
    setSuccess(json.order.trackingCode);
    router.push(`/orders/${json.order.trackingCode}`);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
      <div className="mb-8">
        <h1 className="section-title text-3xl md:text-4xl">{t(titleKey)}</h1>
        <p className="mt-2 max-w-2xl text-[var(--text-muted)]">{t(descKey)}</p>
      </div>

      {success && (
        <div className="mb-6 rounded-xl border border-[rgba(52,211,153,0.35)] bg-[rgba(52,211,153,0.1)] px-4 py-3 text-sm text-[var(--mint)]">
          {t("prebuilts.created", { code: success })}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="order-2 min-w-0 lg:order-1">
          {filtered.length === 0 ? (
            <p className="rounded-2xl border border-[var(--border)] px-5 py-10 text-center text-sm text-[var(--text-muted)]">
              {t("prebuilts.noMatch")}
            </p>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((pc) => (
                <PrebuiltCard
                  key={pc.id}
                  pc={pc}
                  buyBasePath={basePath}
                  onOpen={() => setDetail(pc)}
                  onBuy={() => {
                    void requireLoginThenBuy(pc);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="order-1 lg:order-2">
          {filters && (
            <PartFilters
              brands={brands}
              ramTypes={["DDR4", "DDR5"]}
              priceBounds={priceBounds}
              filters={filters}
              onChange={setFilters}
              resultCount={filtered.length}
            />
          )}
        </div>
      </div>

      <PrebuiltDetailModal
        open={!!detail}
        pc={detail}
        onClose={() => setDetail(null)}
        onBuy={() => {
          if (!detail) return;
          void requireLoginThenBuy(detail);
        }}
      />

      <CheckoutModal
        open={!!checkout}
        onClose={() => setCheckout(null)}
        title={checkout ? checkout.name : ""}
        totalMkd={checkout?.priceMkd ?? 0}
        onSubmit={submitOrder}
      />
    </div>
  );
}

export function PrebuiltCatalog({
  condition,
  basePath,
  titleKey,
  descKey,
}: {
  condition: "new" | "used";
  basePath: string;
  titleKey: string;
  descKey: string;
}) {
  const { t } = useI18n();
  return (
    <Suspense fallback={<div className="p-10 text-[var(--text-muted)]">{t("prebuilts.loading")}</div>}>
      <CatalogInner
        condition={condition}
        basePath={basePath}
        titleKey={titleKey}
        descKey={descKey}
      />
    </Suspense>
  );
}
