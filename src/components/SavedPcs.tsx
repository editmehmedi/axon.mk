"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/LanguageProvider";
import { deleteSavedBuild, listSavedBuilds, type SavedBuild } from "@/lib/builderDraft";

export function SavedPcs() {
  const { t } = useI18n();
  const [items, setItems] = useState<SavedBuild[]>([]);

  useEffect(() => {
    setItems(listSavedBuilds());
  }, []);

  function remove(id: string) {
    deleteSavedBuild(id);
    setItems(listSavedBuilds());
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="section-title text-3xl text-[var(--cyan)] md:text-4xl">{t("saved.title")}</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{t("saved.desc")}</p>

      {items.length === 0 ? (
        <div className="glass mt-8 rounded-2xl p-8 text-center">
          <p className="text-[var(--text-muted)]">{t("saved.empty")}</p>
          <Link href="/configurator" className="btn btn-primary mt-4 inline-flex !text-sm">
            {t("nav.configurator")}
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {items.map((item) => (
            <li key={item.id} className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="section-title text-lg text-[var(--text)]">{item.name}</h2>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {new Date(item.savedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/configurator?draft=${encodeURIComponent(item.id)}`}
                    className="btn btn-primary !py-2 !text-xs"
                  >
                    {t("saved.open")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="btn btn-ghost !py-2 !text-xs text-[var(--danger)]"
                  >
                    {t("saved.delete")}
                  </button>
                </div>
              </div>
              {item.lines.length > 0 && (
                <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                  {item.lines.map((line) => (
                    <div key={`${item.id}-${line.category}`} className="rounded-lg bg-[rgba(7,11,18,0.45)] px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wider text-[var(--cyan-dim)]">
                        {line.category}
                      </dt>
                      <dd className="mt-0.5 text-sm text-[var(--text)]">{line.label}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
