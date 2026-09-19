"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type OrderStatusCode } from "@/lib/constants";
import { LiveBuildPipeline, rememberTrackingCode } from "@/components/LiveBuildPipeline";
import { useI18n } from "@/components/LanguageProvider";
import { useCurrency } from "@/components/CurrencyProvider";

type OrderRow = {
  id: string;
  trackingCode: string;
  status: OrderStatusCode;
  totalMkd: number;
  type: string;
  createdAt: string;
};

export default function OrdersPage() {
  const { t } = useI18n();
  const { formatPrice } = useCurrency();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/orders?mine=1")
      .then(async (r) => {
        const d = await r.json();
        if (r.status === 401) {
          setNeedLogin(true);
          setOrders([]);
          return;
        }
        if (!r.ok) throw new Error(d.error || "Error");
        setNeedLogin(false);
        setOrders(d.orders ?? []);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function pick(code: string) {
    setSelected(code);
    rememberTrackingCode(code);
  }

  if (needLogin) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
        <h1 className="section-title text-3xl">{t("orders.title")}</h1>
        <div className="mt-6 max-w-lg">
          <p className="text-sm text-[var(--text-muted)]">{t("orders.loginHint")}</p>
          <Link href="/login?next=/orders" className="btn btn-primary mt-4">
            {t("orders.login")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      <h1 className="section-title text-3xl">{t("orders.title")}</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{t("orders.hint")}</p>

      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-3">
          <h2 className="section-title text-lg">{t("orders.selectTitle")}</h2>

          {loading && (
            <p className="text-sm text-[var(--text-muted)]">{t("prebuilts.loading")}</p>
          )}

          {!loading &&
            orders.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o.trackingCode)}
                className={`glass w-full rounded-xl p-4 text-left transition hover:border-[var(--border-strong)] ${
                  selected === o.trackingCode ? "ring-1 ring-[var(--cyan)]" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-mono text-[var(--cyan)]">{o.trackingCode}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {o.type} · {t(`status.${o.status}`)}
                    </p>
                  </div>
                  <p className="font-semibold">{formatPrice(o.totalMkd)}</p>
                </div>
              </button>
            ))}

          {!loading && !orders.length && (
            <p className="text-[var(--text-muted)]">{t("orders.empty")}</p>
          )}

          {selected && (
            <Link href={`/orders/${selected}`} className="btn btn-ghost !text-sm">
              {t("orders.openDetails")}
            </Link>
          )}
        </div>

        {selected ? (
          <LiveBuildPipeline trackingCode={selected} showSelector={false} />
        ) : (
          <div className="glass flex min-h-[280px] items-center justify-center rounded-2xl p-6 text-center">
            <p className="max-w-xs text-sm text-[var(--text-muted)]">{t("orders.selectFirst")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
