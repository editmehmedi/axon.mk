"use client";

import { useI18n } from "./LanguageProvider";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-[var(--border)] py-8 text-center text-sm text-[var(--text-muted)]">
      <p className="section-title text-[var(--cyan)]">AXON.MK</p>
      <p className="mt-1">{t("footer.tagline")}</p>
    </footer>
  );
}
