"use client";

import { useI18n } from "./LanguageProvider";

export function PoliciesView({
  companyName,
  phone,
  viber,
}: {
  companyName: string;
  phone: string | null;
  viber: string | null;
}) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <h1 className="section-title text-3xl text-[var(--text)]">{t("policies.title")}</h1>
      <p className="mt-3 text-[var(--text-muted)]">{t("policies.intro", { company: companyName })}</p>

      <section id="terms" className="mt-10 scroll-mt-24">
        <h2 className="section-title text-xl">{t("policies.termsTitle")}</h2>
        <p className="mt-3 whitespace-pre-line text-[var(--text-muted)]">{t("policies.terms")}</p>
      </section>

      <section id="returns" className="mt-10 scroll-mt-24">
        <h2 className="section-title text-xl">{t("policies.returnsTitle")}</h2>
        <p className="mt-3 whitespace-pre-line text-[var(--text-muted)]">{t("policies.returns")}</p>
      </section>

      <section id="warranty" className="mt-10 scroll-mt-24">
        <h2 className="section-title text-xl">{t("policies.warrantyTitle")}</h2>
        <p className="mt-3 whitespace-pre-line text-[var(--text-muted)]">{t("policies.warranty")}</p>
      </section>

      <section id="contact" className="mt-10 scroll-mt-24">
        <h2 className="section-title text-xl">{t("policies.contactTitle")}</h2>
        {phone || viber ? (
          <p className="mt-3 text-[var(--text-muted)]">
            {t("policies.contactPhone", {
              phone: phone ?? viber ?? "",
              viber: viber ?? phone ?? "",
            })}
          </p>
        ) : (
          <p className="mt-3 text-[var(--text-muted)]">{t("policies.contactFallback")}</p>
        )}
      </section>
    </div>
  );
}
