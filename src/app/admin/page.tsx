"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ORDER_STATUSES, formatMkd, formatLocalDateTime, type OrderStatusCode } from "@/lib/constants";
import { AdminInventory } from "@/components/AdminInventory";
import { AdminListings } from "@/components/AdminListings";
import { useI18n } from "@/components/LanguageProvider";
import {
  getSupplierStore,
  resolveStoreId,
  storeSearchUrl,
  type SupplierStore,
} from "@/lib/partStores";

type OrderItem = {
  id: string;
  label: string;
  category: string;
  priceMkd: number;
  qty: number;
  part?: { imageUrl?: string | null } | null;
};

type AdminOrder = {
  id: string;
  trackingCode: string;
  status: OrderStatusCode;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  city: string;
  totalMkd: number;
  partsCostMkd: number;
  assemblyFeeMkd: number;
  selfBuild: boolean;
  type: string;
  cargoCode: string | null;
  verifiedAt: string | null;
  notes: string | null;
  createdAt: string;
  items: OrderItem[];
  prebuilt: {
    name: string;
    cpuLabel: string;
    coolerLabel: string;
    motherboardLabel: string;
    ramLabel: string;
    gpuLabel: string;
    ssdLabel: string;
    psuLabel: string;
    caseLabel: string;
  } | null;
};

type AdminPart = {
  id: string;
  name: string;
  brand: string;
  category: string;
  stock: number;
  priceMkd: number;
  socket?: string | null;
  ramType?: string | null;
  wattage?: number | null;
  tdpWatts?: number | null;
  formFactor?: string | null;
  imageUrl?: string | null;
  active?: boolean;
};

type AdminData = {
  orders: AdminOrder[];
  parts: AdminPart[];
  prebuilts: {
    id: string;
    name: string;
    description?: string;
    cpuLabel?: string;
    coolerLabel?: string;
    motherboardLabel?: string;
    ramLabel?: string;
    gpuLabel?: string;
    ssdLabel?: string;
    psuLabel?: string;
    caseLabel?: string;
    stock: number;
    priceMkd: number;
    imageUrl?: string | null;
    condition?: string;
    conditionGrade?: string;
    active?: boolean;
  }[];
  users: { id: string; email: string; name: string; role: string; isHeadAdmin: boolean }[];
  settings: { assemblyFeeMkd: number } | null;
  analytics: { revenue: number; orderCount: number; byStatus: Record<string, number> };
};

type BuyLine = { category: string; label: string; priceMkd?: number; store: SupplierStore };

function buyStoreForItem(item: {
  label: string;
  part?: { imageUrl?: string | null } | null;
}): SupplierStore {
  if (/included stock cooler/i.test(item.label)) return getSupplierStore("included");
  if (!item.part) return getSupplierStore("used");
  return getSupplierStore(resolveStoreId({ imageUrl: item.part.imageUrl }));
}

function buildBuyList(order: AdminOrder): BuyLine[] {
  if (order.type === "CUSTOM" && order.items?.length) {
    return order.items.flatMap((i) => {
      const qty = i.qty || 1;
      return Array.from({ length: qty }, (_, idx) => ({
        category: i.category,
        label: qty > 1 ? `${i.label} (${idx + 1}/${qty})` : i.label,
        priceMkd: i.priceMkd,
        store: buyStoreForItem(i),
      }));
    });
  }
  if (order.prebuilt) {
    const p = order.prebuilt;
    const store = getSupplierStore("anhoch");
    return [
      { category: "CPU", label: p.cpuLabel, store },
      { category: "COOLER", label: p.coolerLabel, store },
      { category: "MOTHERBOARD", label: p.motherboardLabel, store },
      { category: "RAM", label: p.ramLabel, store },
      { category: "GPU", label: p.gpuLabel, store },
      { category: "SSD", label: p.ssdLabel, store },
      { category: "PSU", label: p.psuLabel, store },
      { category: "CASE", label: p.caseLabel, store },
    ].filter((row) => Boolean(row.label?.trim()));
  }
  return [];
}

function uniqueStores(lines: BuyLine[]): SupplierStore[] {
  const seen = new Set<string>();
  const out: SupplierStore[] = [];
  for (const line of lines) {
    if (!line.store.homepage || seen.has(line.store.id)) continue;
    seen.add(line.store.id);
    out.push(line.store);
  }
  return out;
}

export default function AdminPage() {
  const { t } = useI18n();
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"orders" | "inventory" | "listings" | "users" | "settings">("orders");
  const [ordersView, setOrdersView] = useState<"active" | "done">("active");
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [fee, setFee] = useState(2999);
  const [msg, setMsg] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [bought, setBought] = useState<Record<string, boolean>>({});

  async function load() {
    const res = await fetch("/api/admin");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Forbidden");
      return;
    }
    setData(json);
    setFee(json.settings?.assemblyFeeMkd ?? 2999);
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user));
    load().catch(() => setError("UNAUTHORIZED"));
  }, []);

  async function updateStatus(orderId: string, status: OrderStatusCode, note?: string) {
    const res = await fetch("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        status,
        markVerified: status !== "VERIFICATION",
        generateCargo: status === "HANDED_TO_CARGO",
        note: note || `Admin: ${t(`status.${status}`)}`,
      }),
    });
    if (!res.ok) {
      const j = await res.json();
      setMsg(j.error || "Error");
      return false;
    }
    setMsg(t("admin.statusUpdated"));
    await load();
    return true;
  }

  async function updateRole(userId: string, role: string) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    const j = await res.json();
    if (!res.ok) {
      setMsg(j.error || "Error");
      return;
    }
    setMsg(t("admin.roleUpdated"));
    await load();
  }

  async function saveFee() {
    const res = await fetch("/api/admin", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assemblyFeeMkd: fee }),
    });
    const j = await res.json();
    if (!res.ok) {
      setMsg(j.error || "Error");
      return;
    }
    setMsg(t("admin.feeSaved"));
    await load();
  }

  function copyBuyList(order: AdminOrder) {
    const lines = buildBuyList(order);
    const stores = uniqueStores(lines);
    const text = [
      `AXON.MK order ${order.trackingCode}`,
      `Customer: ${order.customerName} · ${order.customerPhone}`,
      `Buy from: ${stores.map((s) => s.name).join(", ") || "suppliers"}`,
      ...lines.map((l, i) => {
        const search = storeSearchUrl(l.store, l.label);
        return [`${i + 1}. [${l.category}] ${l.label} — ${l.store.name}`, search ? `   ${search}` : ""]
          .filter(Boolean)
          .join("\n");
      }),
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => setMsg(t("admin.buyListCopied")));
  }

  const pendingBuy = useMemo(
    () =>
      data?.orders.filter(
        (o) => o.status === "VERIFICATION" || o.status === "PARTS_SOURCED"
      ).length ?? 0,
    [data]
  );

  const activeOrders = useMemo(
    () => data?.orders.filter((o) => o.status !== "DELIVERED_PAID") ?? [],
    [data]
  );
  const doneOrders = useMemo(
    () => data?.orders.filter((o) => o.status === "DELIVERED_PAID") ?? [],
    [data]
  );

  async function markDone(order: AdminOrder) {
    const ok = await updateStatus(
      order.id,
      "DELIVERED_PAID",
      "PC completed — moved to Done PCs."
    );
    if (!ok) return;
    setOrdersView("done");
    setMsg(t("admin.movedToDone"));
  }

  async function deleteOrder(order: AdminOrder) {
    if (!window.confirm(t("admin.deleteOrderConfirm", { code: order.trackingCode }))) return;
    const res = await fetch("/api/admin", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id }),
    });
    const j = await res.json();
    if (!res.ok) {
      setMsg(j.error || t("admin.deleteOrderError"));
      return;
    }
    if (expanded === order.id) setExpanded(null);
    setMsg(t("admin.orderDeleted", { code: order.trackingCode }));
    await load();
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-[var(--danger)]">{t("admin.noAccess")}</p>
        <Link href="/login" className="btn btn-primary mt-4">
          {t("admin.login")}
        </Link>
      </div>
    );
  }

  if (!data) {
    return <div className="p-10 text-[var(--text-muted)]">{t("admin.loading")}</div>;
  }

  const isHead = me?.role === "head_admin";

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="section-title text-3xl">{t("admin.title")}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {t("admin.subtitle")}
            {isHead ? t("admin.headExtra") : ""}
          </p>
          <p className="mt-2 text-xs text-[var(--cyan)]">{t("admin.supplierFlow")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <div className="glass rounded-xl px-4 py-3">
            <p className="text-xs text-[var(--text-muted)]">{t("admin.orders")}</p>
            <p className="section-title text-xl text-[var(--cyan)]">{data.analytics.orderCount}</p>
          </div>
          <div className="glass rounded-xl px-4 py-3">
            <p className="text-xs text-[var(--text-muted)]">{t("admin.toBuy")}</p>
            <p className="section-title text-xl text-[var(--warn)]">{pendingBuy}</p>
          </div>
          <div className="glass rounded-xl px-4 py-3">
            <p className="text-xs text-[var(--text-muted)]">{t("admin.donePcs")}</p>
            <p className="section-title text-xl text-[var(--mint)]">{doneOrders.length}</p>
          </div>
          <div className="glass rounded-xl px-4 py-3">
            <p className="text-xs text-[var(--text-muted)]">{t("admin.revenue")}</p>
            <p className="section-title text-xl text-[var(--mint)]">
              {formatMkd(data.analytics.revenue)}
            </p>
          </div>
        </div>
      </div>

      {msg && (
        <div className="mb-4 rounded-lg border border-[var(--border)] bg-[rgba(34,211,238,0.08)] px-3 py-2 text-sm">
          {msg}
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ["orders", t("admin.tabOrders")],
            ["inventory", t("admin.tabInventory")],
            ["listings", t("admin.tabListings")],
            ["users", t("admin.tabUsers")],
            ["settings", t("admin.tabSettings")],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-2 text-sm ${
              tab === id
                ? "bg-[var(--cyan)] text-[#041018]"
                : "bg-[rgba(34,211,238,0.06)] text-[var(--text-muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOrdersView("active")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                ordersView === "active"
                  ? "bg-[var(--cyan)] text-[#041018]"
                  : "bg-[rgba(34,211,238,0.08)] text-[var(--text-muted)]"
              }`}
            >
              {t("admin.activeOrders")} ({activeOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setOrdersView("done")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                ordersView === "done"
                  ? "bg-[var(--mint)] text-[#041018]"
                  : "bg-[rgba(52,211,153,0.12)] text-[var(--text-muted)]"
              }`}
            >
              {t("admin.donePcs")} ({doneOrders.length})
            </button>
          </div>

          <div className="space-y-3">
            {(ordersView === "active" ? activeOrders : doneOrders).map((o) => {
              const buyList = buildBuyList(o);
              const isOpen = expanded === o.id;
              const isDone = o.status === "DELIVERED_PAID";
              return (
                <div
                  key={o.id}
                  className={`glass rounded-xl p-4 ${isDone ? "border-[rgba(52,211,153,0.25)]" : ""}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/orders/${o.trackingCode}`}
                        className="font-mono text-[var(--cyan)] hover:underline"
                      >
                        {o.trackingCode}
                      </Link>
                      <p className="mt-1 text-sm">
                        {o.customerName} · {o.customerPhone} · {o.type} · {formatMkd(o.totalMkd)}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {t("admin.orderedAt", { when: formatLocalDateTime(o.createdAt) })}
                        {` · ${t(`status.${o.status}`)}`}
                        {o.cargoCode ? ` · Cargo ${o.cargoCode}` : ""}
                        {!o.verifiedAt
                          ? ` · ${t("admin.waitingVerify")}`
                          : ` · ${t("admin.verified")}`}
                      </p>
                      {isDone && (
                        <p className="mt-1 text-xs font-medium text-[var(--mint)]">
                          ✓ {t("admin.doneBadge")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-ghost !py-2 !text-xs"
                        onClick={() => setExpanded(isOpen ? null : o.id)}
                      >
                        {isOpen ? t("admin.hideBuyList") : t("admin.showBuyList")}
                      </button>
                      {!isDone && (
                        <button
                          type="button"
                          className="btn !border-[rgba(52,211,153,0.45)] !bg-[rgba(52,211,153,0.18)] !py-2 !text-xs !text-[var(--mint)] hover:!bg-[rgba(52,211,153,0.28)]"
                          onClick={() => markDone(o)}
                        >
                          {t("admin.markDone")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn !border-[rgba(251,113,133,0.4)] !bg-[rgba(251,113,133,0.12)] !py-2 !text-xs !text-[var(--danger)] hover:!bg-[rgba(251,113,133,0.22)]"
                        onClick={() => deleteOrder(o)}
                      >
                        {t("admin.deleteOrder")}
                      </button>
                      <select
                        className="input !w-auto !py-2 !text-xs"
                        value={o.status}
                        onChange={(e) => updateStatus(o.id, e.target.value as OrderStatusCode)}
                      >
                        {ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {t(`status.${s}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-4 rounded-xl border border-[rgba(34,211,238,0.2)] bg-[rgba(7,11,18,0.45)] p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="section-title text-sm text-[var(--cyan)]">
                            {t("admin.buyFromSuppliers")}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {t("admin.buyFromSuppliersHint")}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {uniqueStores(buyList).map((store) => (
                            <a
                              key={store.id}
                              href={store.homepage ?? "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-ghost !py-1.5 !text-xs"
                            >
                              {t("admin.openStore", { store: store.name })}
                            </a>
                          ))}
                          <button
                            type="button"
                            className="btn btn-ghost !py-1.5 !text-xs"
                            onClick={() => copyBuyList(o)}
                          >
                            {t("admin.copyBuyList")}
                          </button>
                          {(o.status === "VERIFICATION" || o.status === "PARTS_SOURCED") && (
                            <button
                              type="button"
                              className="btn btn-primary !py-1.5 !text-xs"
                              onClick={() =>
                                updateStatus(
                                  o.id,
                                  "PARTS_SOURCED",
                                  "Parts purchased from suppliers. Ready to build."
                                )
                              }
                            >
                              {t("admin.markPartsSourced")}
                            </button>
                          )}
                          {!isDone && (
                            <button
                              type="button"
                              className="btn !border-[rgba(52,211,153,0.45)] !bg-[rgba(52,211,153,0.18)] !py-1.5 !text-xs !text-[var(--mint)]"
                              onClick={() => markDone(o)}
                            >
                              {t("admin.markDone")}
                            </button>
                          )}
                        </div>
                      </div>

                      <ul className="space-y-2">
                        {buyList.map((line, idx) => {
                          const key = `${o.id}-${idx}`;
                          return (
                            <li
                              key={key}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[rgba(12,20,34,0.7)] px-3 py-2 text-sm"
                            >
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={!!bought[key]}
                                  onChange={(e) =>
                                    setBought((s) => ({ ...s, [key]: e.target.checked }))
                                  }
                                />
                                <span className={bought[key] ? "line-through opacity-50" : ""}>
                                  <span className="text-[var(--cyan-dim)]">[{line.category}]</span>{" "}
                                  {line.label}
                                </span>
                              </label>
                              <div className="flex items-center gap-3">
                                {line.priceMkd != null && (
                                  <span className="text-xs text-[var(--text-muted)]">
                                    {formatMkd(line.priceMkd)}
                                  </span>
                                )}
                                <span className="rounded-full bg-[rgba(34,211,238,0.12)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--cyan)]">
                                  {line.store.name}
                                </span>
                                {line.store.homepage ? (
                                  <a
                                    href={`/api/admin/store-link?store=${encodeURIComponent(line.store.id)}&category=${encodeURIComponent(line.category)}&q=${encodeURIComponent(line.label)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-[var(--cyan)] hover:underline"
                                  >
                                    {t("admin.findOnStore", { store: line.store.name })}
                                  </a>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                        {!buyList.length && (
                          <li className="text-sm text-[var(--text-muted)]">
                            {t("admin.noBuyLines")}
                          </li>
                        )}
                      </ul>

                      <p className="mt-3 text-xs text-[var(--text-muted)]">
                        {o.customerAddress}, {o.city}
                        {o.selfBuild ? ` · ${t("admin.selfBuildOrder")}` : ""}
                        {o.assemblyFeeMkd > 0
                          ? ` · ${t("home.assemblyFee")}: ${formatMkd(o.assemblyFeeMkd)}`
                          : ""}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
            {(ordersView === "active" ? activeOrders : doneOrders).length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">
                {ordersView === "active" ? t("admin.noActiveOrders") : t("admin.noDoneOrders")}
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "inventory" && (
        <AdminInventory
          parts={data.parts}
          prebuilts={data.prebuilts}
          onRefresh={load}
          onMessage={setMsg}
        />
      )}

      {tab === "listings" && <AdminListings onMessage={setMsg} />}

      {tab === "users" && (
        <div className="space-y-2">
          {!isHead && (
            <p className="mb-3 text-sm text-[var(--warn)]">{t("admin.headOnlyRoles")}</p>
          )}
          {data.users.map((u) => (
            <div
              key={u.id}
              className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl p-4"
            >
              <div>
                <p className="font-medium">{u.name}</p>
                <p className="text-sm text-[var(--text-muted)]">
                  {u.email} {u.isHeadAdmin ? "· HEAD" : ""}
                </p>
              </div>
              <select
                className="input !w-auto !py-2 !text-xs"
                disabled={!isHead}
                value={u.role}
                onChange={(e) => updateRole(u.id, e.target.value)}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
                <option value="head_admin">head_admin</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {tab === "settings" && (
        <div className="glass max-w-md rounded-2xl p-5">
          <h2 className="section-title text-lg">{t("admin.assemblyFee")}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t("admin.assemblyFeeHint")}</p>
          <div className="mt-4 flex gap-2">
            <input
              type="number"
              className="input"
              value={fee}
              disabled={!isHead}
              onChange={(e) => setFee(Number(e.target.value))}
            />
            <button disabled={!isHead} onClick={saveFee} className="btn btn-primary">
              {t("admin.save")}
            </button>
          </div>
          <p className="mt-4 text-xs text-[var(--text-muted)]">{t("admin.supplierNote")}</p>
        </div>
      )}
    </div>
  );
}
