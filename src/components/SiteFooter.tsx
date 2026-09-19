"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "./LanguageProvider";

export function SiteFooter() {
  const { t } = useI18n();
  const pathname = usePathname();
  const builderPad = pathname.startsWith("/configurator");
  return (
    <footer
      className={`border-t border-[var(--border)] py-8 text-center text-sm text-[var(--text-muted)] ${
        builderPad ? "pb-36 lg:pb-8" : ""
      }`}
    >
      <p className="section-title text-[var(--cyan)]">AXON.MK</p>
      <p className="mt-1">{t("footer.tagline")}</p>
    </footer>
  );
}
