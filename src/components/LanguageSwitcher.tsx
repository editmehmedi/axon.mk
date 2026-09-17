"use client";

import { LOCALES } from "@/lib/i18n";
import { useI18n } from "./LanguageProvider";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className="glass flex shrink-0 items-center gap-0.5 rounded-full p-0.5"
      title={t("lang.label")}
      role="group"
      aria-label={t("lang.label")}
    >
      {LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLocale(l.code)}
          className={`rounded-full px-1.5 py-1 text-[10px] font-semibold tracking-wide transition sm:px-2 ${
            locale === l.code
              ? "bg-[var(--cyan)] text-[#041018]"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          {l.native}
        </button>
      ))}
    </div>
  );
}
