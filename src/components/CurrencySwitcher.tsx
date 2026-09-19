"use client";

import { CURRENCIES } from "@/lib/currency";
import { useCurrency } from "./CurrencyProvider";
import { useI18n } from "./LanguageProvider";

export function CurrencySwitcher({ full = false }: { full?: boolean }) {
  const { currency, setCurrency } = useCurrency();
  const { t } = useI18n();

  return (
    <div
      className={
        full
          ? "grid w-full grid-cols-3 gap-1 rounded-xl border border-[var(--border)] bg-[rgba(7,11,18,0.55)] p-1"
          : "glass inline-flex w-auto shrink-0 items-center gap-0.5 rounded-full p-0.5"
      }
      title={t("currency.label")}
      role="group"
      aria-label={t("currency.label")}
    >
      {CURRENCIES.map((c) => {
        const active = currency === c.code;
        return (
          <button
            key={c.code}
            type="button"
            onClick={() => setCurrency(c.code)}
            className={
              full
                ? `rounded-lg py-2.5 text-center text-sm font-semibold transition ${
                    active
                      ? "bg-[var(--cyan)] text-[#041018] shadow-[0_0_16px_rgba(34,211,238,0.25)]"
                      : "text-[var(--text-muted)] hover:bg-[rgba(34,211,238,0.08)] hover:text-[var(--text)]"
                  }`
                : `rounded-full px-1.5 py-1 text-[10px] font-semibold tracking-wide transition sm:px-2 ${
                    active
                      ? "bg-[var(--cyan)] text-[#041018]"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`
            }
          >
            {full ? (
              <span className="flex flex-col items-center leading-tight">
                <span className="text-base">{c.native}</span>
                <span className={`mt-0.5 text-[10px] font-medium ${active ? "opacity-70" : "opacity-50"}`}>
                  {c.code === "MKD" ? "DEN" : c.code}
                </span>
              </span>
            ) : (
              c.native
            )}
          </button>
        );
      })}
    </div>
  );
}
