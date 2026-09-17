"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PrebuiltCard, type PrebuiltCardData } from "@/components/PrebuiltCard";
import { formatMkd } from "@/lib/constants";
import { useI18n } from "@/components/LanguageProvider";

export function HomeView({
  prebuilts,
  fee,
}: {
  prebuilts: PrebuiltCardData[];
  fee: number;
}) {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <div>
      <section className="relative min-h-[88vh] overflow-hidden">
        <div className="absolute inset-0 grid-noise opacity-60" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,rgba(34,211,238,0.18),transparent_55%)]" />

        <div className="relative mx-auto flex min-h-[88vh] max-w-7xl flex-col justify-center px-4 py-20 md:px-6">
          <p className="fade-up mb-3 text-sm uppercase tracking-[0.35em] text-[var(--cyan-dim)]">
            {t("home.eyebrow")}
          </p>
          <h1 className="section-title fade-up text-5xl leading-none text-[var(--cyan)] md:text-7xl lg:text-8xl">
            AXON.MK
          </h1>
          <p
            className="fade-up mt-5 max-w-xl text-lg text-[var(--text-muted)] md:text-xl"
            style={{ animationDelay: "0.1s" }}
          >
            {t("home.hero")}
          </p>
          <div className="fade-up mt-8 flex flex-wrap gap-3" style={{ animationDelay: "0.18s" }}>
            <Link href="/prebuilts" className="btn btn-primary">
              {t("home.ctaPrebuilts")}
            </Link>
            <Link href="/used" className="btn btn-ghost">
              {t("home.ctaUsed")}
            </Link>
            <Link href="/used-parts" className="btn btn-ghost">
              {t("home.ctaUsedParts")}
            </Link>
            <Link href="/configurator" className="btn btn-ghost">
              {t("home.ctaBuilder")}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="section-title text-3xl">{t("home.prebuiltsTitle")}</h2>
            <p className="mt-2 text-[var(--text-muted)]">{t("home.prebuiltsDesc")}</p>
          </div>
          <Link href="/prebuilts" className="btn btn-ghost !text-sm">
            {t("home.fullCatalog")}
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {prebuilts.map((pc) => (
            <PrebuiltCard
              key={pc.id}
              pc={pc}
              onOpen={() => router.push(`/prebuilts?view=${pc.slug}`)}
            />
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[rgba(10,18,32,0.55)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-2 md:px-6">
          <div>
            <h2 className="section-title text-3xl">{t("home.builderTitle")}</h2>
            <p className="mt-3 text-[var(--text-muted)]">{t("home.builderDesc")}</p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                t("home.compatSocket"),
                t("home.compatPsu"),
                t("home.compatFee", { fee: formatMkd(fee) }),
                t("home.compatCod"),
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-[var(--cyan)]">▸</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link href="/configurator" className="btn btn-primary mt-8">
              {t("home.openConfigurator")}
            </Link>
          </div>

          <div className="glass rounded-2xl p-6">
            <p className="text-xs uppercase tracking-wider text-[var(--cyan)]">
              {t("home.pricingTitle")}
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between border-b border-[var(--border)] pb-3">
                <span className="text-[var(--text-muted)]">{t("home.partsCost")}</span>
                <span>{formatMkd(52000)}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--border)] pb-3">
                <span className="text-[var(--text-muted)]">{t("home.assemblyFee")}</span>
                <span className="text-[var(--mint)]">+{formatMkd(fee)}</span>
              </div>
              <div className="flex justify-between pt-1 text-base font-semibold">
                <span>{t("home.totalPrice")}</span>
                <span className="text-[var(--cyan)]">{formatMkd(52000 + fee)}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
