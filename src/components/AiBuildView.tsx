"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckoutModal } from "@/components/CheckoutModal";
import { BottleneckPanel } from "@/components/BottleneckPanel";
import { FpsEstimatePanel } from "@/components/FpsEstimatePanel";
import { useCurrency } from "@/components/CurrencyProvider";
import { useI18n } from "@/components/LanguageProvider";
import { ProductImage } from "@/components/ProductImage";
import { rememberTrackingCode } from "@/components/LiveBuildPipeline";
import { loginUrl } from "@/lib/clientAuth";
import { saveBuilderDraft } from "@/lib/builderDraft";
import { AI_MIN_BUDGET_MKD, AI_USE_CASES, type AiBuild, type AiBuildLine, type AiUseCase } from "@/lib/aiBuild";
import { BUILDER_STEPS } from "@/lib/constants";
import { convertFromMkd, type CurrencyCode } from "@/lib/currency";
import { isStockCoolerPart, ramKitLabel } from "@/lib/compatibility";
import { resolvePartImage } from "@/lib/partImages";

const STORAGE_KEY = "axon_ai_build";
const CHECKOUT_KEY = "axon_ai_checkout";

const PRESETS = [30000, 50000, 80000, 120000];
const DEFAULT_BUDGET = 60000;

const STEP_KEYS: Record<string, string> = {
  CPU: "builder.cpu",
  COOLER: "builder.cooler",
  MOTHERBOARD: "builder.motherboard",
  RAM: "builder.ram",
  GPU: "builder.gpu",
  PSU: "builder.psu",
  CASE: "builder.case",
  SSD: "builder.ssd",
};

function toMkd(amount: number, currency: CurrencyCode, rates: Record<"USD" | "EUR", number>): number {
  if (currency === "MKD") return Math.round(amount);
  const per = rates[currency];
  return Math.round(amount * (per > 0 ? per : 1));
}

function specOf(line: AiBuildLine, stockCooler: string): string {
  if (line.category === "CPU") {
    return [line.socket, line.tdpWatts ? `${line.tdpWatts}W` : ""].filter(Boolean).join(" · ");
  }
  if (line.category === "COOLER" && isStockCoolerPart(line)) return stockCooler;
  if (line.category === "MOTHERBOARD") {
    return [line.socket, line.ramType, line.formFactor].filter(Boolean).join(" · ");
  }
  if (line.category === "RAM") return ramKitLabel(line.name) ?? "";
  if (line.category === "GPU") return line.tdpWatts ? `${line.tdpWatts}W` : "";
  if (line.category === "PSU") return line.wattage ? `${line.wattage}W` : "";
  if (line.category === "CASE") return line.formFactor ?? "";
  return "";
}

export function AiBuildView() {
  const { t } = useI18n();
  const { currency, rates, formatPrice } = useCurrency();
  const router = useRouter();
  const [useCase, setUseCase] = useState<AiUseCase>("gaming");
  const [budgetText, setBudgetText] = useState(String(DEFAULT_BUDGET));
  const [build, setBuild] = useState<AiBuild | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const budgetCurrency = useRef<CurrencyCode | null>(null);

  useEffect(() => {
    if (budgetCurrency.current === currency) return;
    budgetCurrency.current = currency;
    setBudgetText(String(Math.round(convertFromMkd(DEFAULT_BUDGET, currency, rates))));
  }, [currency, rates]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as AiBuild;
        if (saved?.lines?.length) setBuild(saved);
      }
      if (sessionStorage.getItem(CHECKOUT_KEY) === "1" && raw) {
        sessionStorage.removeItem(CHECKOUT_KEY);
        setCheckoutOpen(true);
      }
    } catch {
      /* ignore stored draft */
    }
  }, []);

  function budgetMkd(): number {
    const amount = Number(budgetText.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return toMkd(amount, currency, rates);
  }

  async function buildPc() {
    const budget = budgetMkd();
    setError("");
    if (budget < AI_MIN_BUDGET_MKD) {
      setError(t("ai.error.low", { amount: formatPrice(AI_MIN_BUDGET_MKD) }));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budgetMkd: budget, useCase }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === "budget_low") {
          setError(t("ai.error.low", { amount: formatPrice(json.minBudgetMkd ?? AI_MIN_BUDGET_MKD) }));
        } else if (json.error === "no_build") {
          setError(t("ai.error.none"));
        } else {
          setError(t("ai.error.generic"));
        }
        return;
      }
      setBuild(json.build as AiBuild);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(json.build));
    } catch {
      setError(t("ai.error.generic"));
    } finally {
      setLoading(false);
    }
  }

  function editInBuilder() {
    if (!build) return;
    const ids: Partial<Record<(typeof BUILDER_STEPS)[number], string | string[] | null>> = {};
    const ramQtyById: Record<string, number> = {};
    const ssdQtyById: Record<string, number> = {};
    for (const cat of BUILDER_STEPS) {
      const line = build.lines.find((item) => item.category === cat);
      if (cat === "SSD") {
        ids.SSD = line ? [line.id] : ["none:SSD"];
        if (line) ssdQtyById[line.id] = line.qty;
        continue;
      }
      if (cat === "GPU") {
        ids.GPU = line?.id ?? "none:GPU";
        continue;
      }
      if (cat === "COOLER") {
        ids.COOLER = line?.id ?? "none:COOLER";
        continue;
      }
      ids[cat] = line?.id ?? null;
      if (cat === "RAM" && line) ramQtyById[line.id] = line.qty;
    }
    saveBuilderDraft({ condition: "new", step: 0, ids, ramQtyById, ssdQtyById });
    router.push("/configurator");
  }

  async function submitOrder(data: {
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    customerAddress: string;
    city: string;
  }) {
    if (!build) return;
    const partIds: string[] = [];
    for (const line of build.lines) {
      if (line.id.startsWith("none:")) continue;
      for (let i = 0; i < line.qty; i++) partIds.push(line.id);
    }
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "CUSTOM",
        partIds,
        listingIds: [],
        selfBuild: false,
        ...data,
      }),
    });
    const json = await res.json();
    if (res.status === 401) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(build));
      sessionStorage.setItem(CHECKOUT_KEY, "1");
      router.push(loginUrl("/ai-build"));
      throw new Error(json.error || "Login required");
    }
    if (!res.ok) throw new Error(json.error || "Error");
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(CHECKOUT_KEY);
    rememberTrackingCode(json.order.trackingCode, {
      status: json.order.status,
      type: "CUSTOM",
      label: "AI Build",
      totalMkd: json.order.totalMkd,
    });
    setCheckoutOpen(false);
    router.push(`/orders/${json.order.trackingCode}`);
  }

  const showFps =
    Boolean(build?.gpuName) &&
    (build?.useCase === "gaming" || build?.useCase === "streaming" || build?.useCase === "content");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 pb-40 md:px-6 lg:pb-10">
      <div className="mb-8 max-w-2xl">
        <h1 className="section-title text-3xl md:text-4xl">{t("ai.title")}</h1>
        <p className="mt-2 text-[var(--text-muted)]">{t("ai.desc")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <form
          className="glass-strong h-fit rounded-2xl p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void buildPc();
          }}
        >
          <p className="text-sm font-medium">{t("ai.use")}</p>
          <div className="mt-3 grid gap-2">
            {AI_USE_CASES.map((id) => {
              const active = useCase === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setUseCase(id)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-[rgba(34,211,238,0.55)] bg-[rgba(34,211,238,0.12)]"
                      : "border-[var(--border)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <p className={`text-sm font-semibold ${active ? "text-[var(--cyan)]" : ""}`}>
                    {t(`ai.use.${id}`)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t(`ai.use.${id}Hint`)}</p>
                </button>
              );
            })}
          </div>

          <label className="mt-5 block text-sm font-medium" htmlFor="ai-budget">
            {t("ai.budget")}
            <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">{currency}</span>
          </label>
          <input
            id="ai-budget"
            inputMode="numeric"
            value={budgetText}
            onChange={(e) => setBudgetText(e.target.value)}
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[rgba(7,11,18,0.55)] px-3 py-2.5 text-base outline-none focus:border-[var(--cyan)]"
          />
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">
            {t("ai.budgetHint", { amount: formatPrice(AI_MIN_BUDGET_MKD) })}
          </p>

          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {t("ai.presets")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => {
                  setBudgetText(String(Math.round(convertFromMkd(amount, currency, rates))));
                }}
                className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text)] hover:border-[var(--cyan)] hover:text-[var(--cyan)]"
              >
                {formatPrice(amount)}
              </button>
            ))}
          </div>

          {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}

          <button type="submit" className="btn btn-primary mt-5 w-full" disabled={loading}>
            {loading ? t("ai.building") : t("ai.build")}
          </button>
        </form>

        <div className="space-y-4">
          {!build && (
            <div className="glass rounded-2xl p-6 text-sm text-[var(--text-muted)]">{t("ai.empty")}</div>
          )}

          {build && (
            <>
              <div className="glass-strong rounded-2xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="section-title text-2xl">{t("ai.specs")}</h2>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{t(`ai.focus.${build.focus}`)}</p>
                  </div>
                  <p className="text-sm text-[var(--mint)]">
                    {t("ai.under", { amount: formatPrice(Math.max(0, build.budgetMkd - build.totalMkd)) })}
                  </p>
                </div>

                <ul className="mt-4 divide-y divide-[var(--border)]">
                  {build.lines.map((line) => {
                    const spec = specOf(line, t("ai.stockCooler"));
                    const label = `${line.brand} ${line.name}`.trim();
                    return (
                      <li key={`${line.category}-${line.id}`} className="flex gap-3 py-3">
                        <ProductImage
                          src={resolvePartImage(line)}
                          alt={label}
                          className="w-16 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs uppercase tracking-wide text-[var(--cyan-dim)]">
                            {t(STEP_KEYS[line.category] ?? line.category)}
                            {line.qty > 1 ? ` ×${line.qty}` : ""}
                          </p>
                          <p className="truncate text-sm font-medium">{label}</p>
                          {spec && <p className="text-xs text-[var(--text-muted)]">{spec}</p>}
                        </div>
                        <p className="shrink-0 text-sm">{formatPrice(line.priceMkd * line.qty)}</p>
                      </li>
                    );
                  })}
                  {!build.gpuName && (
                    <li className="flex gap-3 py-3">
                      <div className="w-16 shrink-0 rounded-xl bg-[rgba(34,211,238,0.06)]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs uppercase tracking-wide text-[var(--cyan-dim)]">{t("builder.gpu")}</p>
                        <p className="text-sm font-medium">{t("ai.integrated")}</p>
                      </div>
                    </li>
                  )}
                </ul>

                <div className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3 text-sm">
                  <div className="flex justify-between gap-3 text-[var(--text-muted)]">
                    <span>{t("ai.parts")}</span>
                    <span>{formatPrice(build.partsCostMkd)}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-[var(--text-muted)]">
                    <span>{t("ai.assembly")}</span>
                    <span>{formatPrice(build.assemblyFeeMkd)}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-base font-semibold">
                    <span>{t("ai.total")}</span>
                    <span className="text-[var(--cyan)]">{formatPrice(build.totalMkd)}</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button type="button" className="btn btn-primary flex-1" onClick={() => setCheckoutOpen(true)}>
                    {t("ai.buy")}
                  </button>
                  <button type="button" className="btn btn-ghost flex-1" onClick={editInBuilder}>
                    {t("ai.edit")}
                  </button>
                </div>
              </div>

              {showFps && <FpsEstimatePanel gpuName={build.gpuName} cpuName={build.cpuName} />}
              {build.gpuName && <BottleneckPanel gpuName={build.gpuName} cpuName={build.cpuName} />}
            </>
          )}
        </div>
      </div>

      {build && (
        <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-[var(--border)] bg-[rgba(7,11,18,0.94)] p-3 backdrop-blur-xl lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div>
              <p className="text-xs text-[var(--text-muted)]">{t("ai.total")}</p>
              <p className="font-semibold text-[var(--cyan)]">{formatPrice(build.totalMkd)}</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setCheckoutOpen(true)}>
              {t("ai.buy")}
            </button>
          </div>
        </div>
      )}

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title={t("ai.buy")}
        totalMkd={build?.totalMkd ?? 0}
        onSubmit={submitOrder}
      />
    </div>
  );
}
