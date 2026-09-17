"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/LanguageProvider";
import {
  estimateBuildFps,
  type FpsEstimate,
  type FpsQuality,
} from "@/lib/fpsEstimates";

type Props = {
  gpuName?: string | null;
  cpuName?: string | null;
};

const labelClass: Record<FpsEstimate["label"], string> = {
  esports: "text-[var(--mint)]",
  high: "text-[var(--cyan)]",
  medium: "text-[var(--warn)]",
  playable: "text-[var(--warn)]",
  low: "text-[var(--danger)]",
};

const QUALITIES: FpsQuality[] = ["low", "medium", "high"];

export function FpsEstimatePanel({ gpuName, cpuName }: Props) {
  const { t } = useI18n();
  const [quality, setQuality] = useState<FpsQuality>("low");

  const estimates = useMemo(
    () => estimateBuildFps({ gpuName, cpuName, quality }),
    [gpuName, cpuName, quality]
  );

  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="section-title text-lg">{t("builder.fpsTitle")}</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{t("builder.fpsHint")}</p>

      {!estimates ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">{t("builder.fpsNeedGpu")}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {QUALITIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuality(q)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  quality === q
                    ? "bg-[var(--mint)] text-[#041018]"
                    : "bg-[rgba(52,211,153,0.1)] text-[var(--text-muted)]"
                }`}
              >
                {t(`builder.fpsQuality.${q}`)}
              </button>
            ))}
          </div>

          <ul className="mt-3 space-y-2">
            {estimates.map((row) => (
              <li
                key={row.gameId}
                className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2 text-sm last:border-0 last:pb-0"
              >
                <span className="text-[var(--text-muted)]">{t(row.nameKey)}</span>
                <span className={`font-semibold tabular-nums ${labelClass[row.label]}`}>
                  ~{row.fps1080} {t("builder.fpsUnit")}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-muted)]">
            {t("builder.fpsDisclaimer")}
          </p>
        </>
      )}
    </div>
  );
}
