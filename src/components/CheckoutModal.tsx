"use client";

import { useEffect, useState } from "react";
import { formatMkd } from "@/lib/constants";
import { fetchSessionUser } from "@/lib/clientAuth";
import { useI18n } from "./LanguageProvider";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  totalMkd: number;
  onSubmit: (data: {
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    customerAddress: string;
    city: string;
  }) => Promise<void>;
};

export function CheckoutModal({ open, onClose, title, totalMkd, onSubmit }: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    customerAddress: "",
    city: "Skopje",
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchSessionUser().then((user) => {
      if (cancelled || !user) return;
      setForm((prev) => ({
        ...prev,
        customerName: prev.customerName || user.name || "",
        customerEmail: prev.customerEmail || user.email || "",
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("checkout.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="glass-strong w-full max-w-lg rounded-2xl p-6 fade-up">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="section-title text-xl">{title}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{t("checkout.titleCod")}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost !px-3 !py-1.5 !text-sm">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {(
            [
              ["customerName", t("checkout.name"), "text"],
              ["customerPhone", t("checkout.phone"), "tel"],
              ["customerEmail", t("checkout.email"), "email"],
              ["customerAddress", t("checkout.address"), "text"],
              ["city", t("checkout.city"), "text"],
            ] as const
          ).map(([key, label, type]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input
                required
                type={type}
                className="input"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}

          <div className="rounded-xl border border-[var(--border)] bg-[rgba(7,11,18,0.5)] p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t("checkout.total")}</span>
              <span className="font-semibold text-[var(--cyan)]">{formatMkd(totalMkd)}</span>
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">{t("checkout.verifyNote")}</p>
            <p className="mt-1 text-xs text-[var(--mint)]">{t("checkout.emailNote")}</p>
          </div>

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? t("checkout.processing") : t("checkout.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
