"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "./LanguageProvider";

export function SiteFooter({
  companyName,
  phone,
  viber,
}: {
  companyName: string;
  phone: string | null;
  viber: string | null;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const builderPad = pathname.startsWith("/configurator") || pathname.startsWith("/ai-build");
  return (
    <footer
      className={`border-t border-[var(--border)] py-8 text-center text-sm text-[var(--text-muted)] ${
        builderPad ? "pb-36 lg:pb-8" : ""
      }`}
    >
      <p className="section-title text-[var(--cyan)]">{companyName}</p>
      <p className="mt-1">{t("footer.tagline")}</p>
      {phone || viber ? (
        <p className="mt-2">
          {phone ? (
            <a className="hover:text-[var(--cyan)]" href={`tel:${phone.replace(/\s/g, "")}`}>
              {t("footer.phone")} {phone}
            </a>
          ) : null}
          {phone && viber ? " · " : null}
          {viber ? (
            <a
              className="hover:text-[var(--cyan)]"
              href={`viber://chat?number=${encodeURIComponent(viber.replace(/\s/g, ""))}`}
            >
              {t("footer.viber")} {viber}
            </a>
          ) : null}
        </p>
      ) : (
        <p className="mt-2">{t("footer.callback")}</p>
      )}
      <p className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link className="hover:text-[var(--cyan)]" href="/policies#terms">
          {t("footer.terms")}
        </Link>
        <Link className="hover:text-[var(--cyan)]" href="/policies#returns">
          {t("footer.returns")}
        </Link>
        <Link className="hover:text-[var(--cyan)]" href="/policies#warranty">
          {t("footer.warranty")}
        </Link>
      </p>
    </footer>
  );
}
