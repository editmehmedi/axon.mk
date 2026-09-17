"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ORDER_STATUSES, type OrderStatusCode } from "@/lib/constants";
import { localizeOrderNote } from "@/lib/orderNotes";
import { useI18n } from "./LanguageProvider";

const STORAGE_KEY = "axon_track";
const RECENTS_KEY = "axon_track_recents";
const CHANGE_EVENT = "axon-track-change";

export type TrackedOrderSummary = {
  trackingCode: string;
  status: OrderStatusCode;
  type?: string;
  label?: string;
  totalMkd?: number;
  updatedAt?: string;
};

export function rememberTrackingCode(code: string, meta?: Partial<TrackedOrderSummary>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, code);
  const raw = localStorage.getItem(RECENTS_KEY);
  const list: TrackedOrderSummary[] = raw ? JSON.parse(raw) : [];
  const next: TrackedOrderSummary = {
    trackingCode: code,
    status: meta?.status ?? "VERIFICATION",
    type: meta?.type,
    label: meta?.label,
    totalMkd: meta?.totalMkd,
    updatedAt: new Date().toISOString(),
  };
  const merged = [next, ...list.filter((o) => o.trackingCode !== code)].slice(0, 8);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { code } }));
}

export function getSelectedTrackingCode(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function getRecentTrackingCodes(): TrackedOrderSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

type HistoryEvent = {
  status: OrderStatusCode;
  note: string | null;
  createdAt: string;
};

type LiveOrder = {
  trackingCode: string;
  cargoCode: string | null;
  status: OrderStatusCode;
  type: string;
  totalMkd: number;
  customerName?: string;
  prebuilt?: { name: string } | null;
  items?: { label: string; category: string }[];
  statusHistory: HistoryEvent[];
};

type Props = {
  trackingCode?: string | null;
  compact?: boolean;
  showSelector?: boolean;
  className?: string;
  onOrderLoaded?: (order: LiveOrder | null) => void;
};

const PIPELINE_STAGES = ORDER_STATUSES.slice(0, 4);

function orderFingerprint(o: LiveOrder | null): string {
  if (!o) return "";
  return JSON.stringify({
    trackingCode: o.trackingCode,
    status: o.status,
    cargoCode: o.cargoCode,
    totalMkd: o.totalMkd,
    history: o.statusHistory?.map((h) => [h.status, h.note, h.createdAt]),
  });
}

export function LiveBuildPipeline({
  trackingCode,
  compact = false,
  showSelector = false,
  className = "",
  onOrderLoaded,
}: Props) {
  const { t } = useI18n();
  const [code, setCode] = useState<string | null>(trackingCode ?? null);
  const [recents, setRecents] = useState<TrackedOrderSummary[]>([]);
  const [order, setOrder] = useState<LiveOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lookup, setLookup] = useState("");

  const onOrderLoadedRef = useRef(onOrderLoaded);
  const orderFpRef = useRef("");
  const inFlightRef = useRef(false);
  const codeRef = useRef<string | null>(trackingCode ?? null);

  useEffect(() => {
    onOrderLoadedRef.current = onOrderLoaded;
  }, [onOrderLoaded]);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  const refreshRecents = useCallback(() => {
    setRecents(getRecentTrackingCodes());
  }, []);

  const loadOrder = useCallback(
    async (trackCode: string, opts?: { select?: boolean; silent?: boolean }) => {
      const select = opts?.select ?? true;
      const silent = opts?.silent ?? false;
      if (inFlightRef.current && silent) return;
      inFlightRef.current = true;

      if (!silent) {
        setLoading(true);
        setError("");
      }

      try {
        const res = await fetch(`/api/orders/track?code=${encodeURIComponent(trackCode)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Not found");
        const loaded = data.order as LiveOrder;
        const fp = orderFingerprint(loaded);

        // Silent poll with no change → do not touch React state (prevents shake)
        if (fp === orderFpRef.current) {
          return;
        }

        orderFpRef.current = fp;
        setOrder(loaded);
        onOrderLoadedRef.current?.(loaded);

        if (select) {
          rememberTrackingCode(loaded.trackingCode, {
            status: loaded.status,
            type: loaded.type,
            label:
              loaded.type === "PREBUILT"
                ? loaded.prebuilt?.name
                : "Custom Build",
            totalMkd: loaded.totalMkd,
          });
          setCode(loaded.trackingCode);
          refreshRecents();
        }
      } catch (e) {
        if (!silent) {
          orderFpRef.current = "";
          setOrder(null);
          setError(e instanceof Error ? e.message : "Error");
          onOrderLoadedRef.current?.(null);
        }
      } finally {
        inFlightRef.current = false;
        if (!silent) setLoading(false);
      }
    },
    [refreshRecents]
  );

  useEffect(() => {
    refreshRecents();
    const selected = trackingCode ?? getSelectedTrackingCode();
    if (selected) {
      setCode(selected);
      void loadOrder(selected, { select: false, silent: false });
    }

    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY || e.key === RECENTS_KEY) {
        refreshRecents();
        const next = getSelectedTrackingCode();
        if (next && next !== codeRef.current) {
          setCode(next);
          void loadOrder(next, { select: false, silent: true });
        }
      }
    }

    function onCustom(e: Event) {
      refreshRecents();
      const detailCode = (e as CustomEvent<{ code?: string }>).detail?.code;
      const next = detailCode || getSelectedTrackingCode();
      if (!next || next === codeRef.current) return;
      setCode(next);
      void loadOrder(next, { select: false, silent: true });
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onCustom);
    };
  }, [trackingCode, loadOrder, refreshRecents]);

  // Quiet background poll — no UI updates unless status changed
  useEffect(() => {
    if (!code) return;
    if (order?.status === "DELIVERED_PAID") return;
    const id = window.setInterval(() => {
      void loadOrder(code, { select: false, silent: true });
    }, 15000);
    return () => window.clearInterval(id);
  }, [code, order?.status, loadOrder]);

  useEffect(() => {
    if (trackingCode && trackingCode !== code) {
      setCode(trackingCode);
      void loadOrder(trackingCode, { select: true, silent: false });
    }
  }, [trackingCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = order ? ORDER_STATUSES.indexOf(order.status) : -1;

  async function selectRecent(trackCode: string) {
    await loadOrder(trackCode, { select: true, silent: false });
  }

  async function submitLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!lookup.trim()) return;
    await loadOrder(lookup.trim(), { select: true, silent: false });
    setLookup("");
  }

  return (
    <div className={`rounded-2xl border border-[rgba(34,211,238,0.15)] bg-[rgba(7,11,18,0.7)] p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`pulse-dot ${order ? "" : "opacity-40"}`} />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--cyan)]">
            {t("pipeline.title")}
          </span>
        </div>
        {order && (
          <span className="font-mono text-[10px] text-[var(--text-muted)]">{order.trackingCode}</span>
        )}
      </div>

      {showSelector && (
        <div className="mb-4 space-y-2">
          {recents.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recents.map((r) => (
                <button
                  key={r.trackingCode}
                  type="button"
                  onClick={() => selectRecent(r.trackingCode)}
                  className={`rounded-lg px-2.5 py-1.5 font-mono text-[10px] transition ${
                    code === r.trackingCode
                      ? "bg-[var(--cyan)] text-[#041018]"
                      : "bg-[rgba(34,211,238,0.08)] text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {r.trackingCode}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={submitLookup} className="flex gap-2">
            <input
              className="input !py-1.5 !text-xs"
              placeholder={t("pipeline.selectPlaceholder")}
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
            />
            <button type="submit" className="btn btn-primary !px-3 !py-1.5 !text-xs">
              Live
            </button>
          </form>
        </div>
      )}

      {!order && !loading && (
        <div className="space-y-3 font-mono text-xs text-[var(--text-muted)]">
          <p>{t("pipeline.empty")}</p>
          {PIPELINE_STAGES.map((s, i) => (
            <div
              key={s}
              className="flex items-center justify-between rounded-lg bg-[rgba(7,11,18,0.5)] px-3 py-2 opacity-50"
            >
              <span>
                {i + 1}. {t(`status.${s}`)}
              </span>
              <span>○</span>
            </div>
          ))}
        </div>
      )}

      {loading && !order && (
        <p className="text-xs text-[var(--text-muted)]">{t("pipeline.loading")}</p>
      )}

      {error && <p className="mb-2 text-xs text-[var(--danger)]">{error}</p>}

      {order && (
        <>
          {!compact && (
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              {order.type === "PREBUILT"
                ? order.prebuilt?.name ?? "Pre-built"
                : t("orders.customBuild")}
              {order.cargoCode ? ` · Cargo ${order.cargoCode}` : ""}
              {" · "}
              {t(`status.${order.status}`)}
            </p>
          )}

          <div className="space-y-2.5 font-mono text-xs">
            {PIPELINE_STAGES.map((status, i) => {
              const finished = order.status === "DELIVERED_PAID";
              const done = finished || i < step;
              const current = !finished && i === step;
              const waiting = !finished && i > step;
              const historyNote = localizeOrderNote(
                [...order.statusHistory]
                  .reverse()
                  .find((h) => h.status === status)?.note,
                t
              );

              return (
                <div
                  key={status}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${
                    current
                      ? "bg-[rgba(34,211,238,0.14)] text-[var(--text)] ring-1 ring-[rgba(34,211,238,0.35)]"
                      : done
                        ? "bg-[rgba(52,211,153,0.1)] text-[var(--text)]"
                        : "bg-[rgba(7,11,18,0.5)] text-[var(--text-muted)]"
                  }`}
                >
                  <div className="min-w-0">
                    <p>
                      {i + 1}. {t(`status.${status}`)}
                    </p>
                    {!compact && historyNote && (done || current) && (
                      <p className="mt-0.5 truncate text-[10px] opacity-70">{historyNote}</p>
                    )}
                  </div>
                  <span className="shrink-0">
                    {done && !current && <span className="text-[var(--mint)]">✓</span>}
                    {current && (
                      <span className="inline-flex items-center gap-1 text-[var(--cyan)]">
                        <span className="pulse-dot !h-2 !w-2" /> {t("pipeline.live")}
                      </span>
                    )}
                    {waiting && <span className="opacity-40">○</span>}
                  </span>
                </div>
              );
            })}
          </div>

          {order.status === "DELIVERED_PAID" && (
            <p className="mt-3 text-xs text-[var(--mint)]">{t("pipeline.delivered")}</p>
          )}
        </>
      )}
    </div>
  );
}
