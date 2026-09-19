"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { formatDateTime, type OrderStatusCode } from "@/lib/constants";
import { LiveBuildPipeline } from "@/components/LiveBuildPipeline";
import { localizeOrderNote } from "@/lib/orderNotes";
import { useI18n } from "@/components/LanguageProvider";
import { useCurrency } from "@/components/CurrencyProvider";

type OrderDetail = {
  trackingCode: string;
  cargoCode: string | null;
  status: OrderStatusCode;
  type: string;
  totalMkd: number;
  customerName?: string;
  prebuilt?: { name: string } | null;
  items?: { label: string; category: string; priceMkd?: number; qty?: number }[];
  statusHistory: { status: OrderStatusCode; note: string | null; createdAt: string }[];
};

function fingerprint(o: OrderDetail | null): string {
  if (!o) return "";
  return JSON.stringify({
    trackingCode: o.trackingCode,
    status: o.status,
    cargoCode: o.cargoCode,
    totalMkd: o.totalMkd,
    history: o.statusHistory?.map((h) => [h.status, h.note, h.createdAt]),
    items: o.items?.map((i) => [i.category, i.label, i.priceMkd, i.qty]),
  });
}

export default function OrderDetailPage() {
  const { t } = useI18n();
  const { formatPrice } = useCurrency();
  const params = useParams<{ code: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const fpRef = useRef("");

  const onOrderLoaded = useCallback(
    (o: OrderDetail | null) => {
      if (!o) {
        setError(t("orders.notFound"));
        setOrder(null);
        fpRef.current = "";
        return;
      }
      const next = o as OrderDetail;
      const fp = fingerprint(next);
      if (fp === fpRef.current) return;
      fpRef.current = fp;
      setError("");
      setOrder(next);
    },
    [t]
  );

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-[var(--danger)]">{error}</div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <p className="text-xs uppercase tracking-wider text-[var(--cyan)]">{t("pipeline.title")}</p>
      <h1 className="section-title mt-2 font-mono text-3xl">
        {order?.trackingCode ?? params.code}
      </h1>
      {order && (
        <>
          <p className="mt-2 text-[var(--text-muted)]">
            {order.type === "PREBUILT" ? order.prebuilt?.name : t("orders.customBuild")} ·{" "}
            {formatPrice(order.totalMkd)} · COD
          </p>
          {order.cargoCode && (
            <p className="mt-1 text-sm text-[var(--mint)]">Cargo: {order.cargoCode}</p>
          )}
        </>
      )}

      <div className="mt-8">
        <LiveBuildPipeline
          trackingCode={params.code}
          showSelector={false}
          onOrderLoaded={onOrderLoaded}
        />
      </div>

      {order?.statusHistory && order.statusHistory.length > 0 && (
        <div className="glass mt-6 rounded-2xl p-5">
          <h2 className="section-title text-lg">{t("orders.history")}</h2>
          <ol className="mt-4 space-y-4">
            {order.statusHistory.map((ev, i) => (
              <li key={`${ev.status}-${ev.createdAt}-${i}`} className="flex gap-3">
                <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--cyan)]" />
                <div>
                  <p className="font-medium">{t(`status.${ev.status}`)}</p>
                  {ev.note && (
                    <p className="text-sm text-[var(--text-muted)]">
                      {localizeOrderNote(ev.note, t)}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {formatDateTime(ev.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {order?.items && order.items.length > 0 && (
        <div className="glass mt-6 rounded-2xl p-5">
          <h2 className="section-title text-lg">{t("orders.parts")}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {order.items.map((item, i) => {
              const qty = item.qty && item.qty > 1 ? item.qty : 1;
              const lineTotal = (item.priceMkd ?? 0) * qty;
              return (
              <li key={`${item.category}-${item.label}-${i}`} className="flex justify-between gap-3">
                <span>
                  {item.category}: {item.label}
                  {qty > 1 ? ` ×${qty}` : ""}
                </span>
                <span>{item.priceMkd != null ? formatPrice(lineTotal) : ""}</span>
              </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
