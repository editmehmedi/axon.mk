"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PrebuiltCard, type PrebuiltCardData } from "@/components/PrebuiltCard";
import { useI18n } from "@/components/LanguageProvider";

export function HomeView({ prebuilts }: { prebuilts: PrebuiltCardData[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [buying, setBuying] = useState(false);

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-noise opacity-40" />
        <div className="relative mx-auto max-w-3xl px-4 py-14 text-center md:px-6 md:py-20">
          <p className="text-sm uppercase tracking-[0.28em] text-[var(--cyan-dim)]">
            {t("home.eyebrow")}
          </p>
          <h1 className="section-title mt-3 text-4xl text-[var(--cyan)] md:text-6xl">AXON.MK</h1>
          <p className="mx-auto mt-4 max-w-md text-base text-[var(--text-muted)] md:text-lg">
            {buying ? t("home.buyChoose") : t("home.hero")}
          </p>

          {buying ? (
            <div className="mt-8 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  href="/prebuilts"
                  className="glass-strong rounded-2xl p-5 text-left transition hover:border-[var(--cyan)]"
                >
                  <p className="section-title text-xl text-[var(--cyan)]">{t("home.buyNew")}</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">{t("home.buyNewHint")}</p>
                </Link>
                <Link
                  href="/used"
                  className="glass rounded-2xl p-5 text-left transition hover:border-[var(--border-strong)]"
                >
                  <p className="section-title text-xl text-[var(--text)]">{t("home.buyUsed")}</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">{t("home.buyUsedHint")}</p>
                </Link>
              </div>
              <button
                type="button"
                onClick={() => setBuying(false)}
                className="text-sm text-[var(--text-muted)] transition hover:text-[var(--cyan)]"
              >
                ← {t("home.back")}
              </button>
            </div>
          ) : (
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setBuying(true)}
                className="glass rounded-2xl p-5 text-left transition hover:border-[var(--border-strong)]"
              >
                <p className="section-title text-xl text-[var(--text)]">{t("home.buyTitle")}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{t("home.buyHint")}</p>
              </button>
              <Link
                href="/configurator"
                className="glass-strong rounded-2xl p-5 text-left transition hover:border-[var(--cyan)]"
              >
                <p className="section-title text-xl text-[var(--cyan)]">{t("home.buildTitle")}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{t("home.buildHint")}</p>
              </Link>
            </div>
          )}
        </div>
      </section>

      {prebuilts.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-16 md:px-6">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="section-title text-2xl md:text-3xl">{t("home.prebuiltsTitle")}</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{t("home.prebuiltsDesc")}</p>
            </div>
            <Link href="/prebuilts" className="shrink-0 text-sm text-[var(--cyan)]">
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
      )}
    </div>
  );
}
