"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/LanguageProvider";
import {
  BOTTLENECK_RESOLUTIONS,
  estimateBottleneck,
  type BottleneckResolution,
  type BottleneckResult,
} from "@/lib/bottleneck";

type Props = {
  gpuName?: string | null;
  cpuName?: string | null;
};

const severityClass: Record<BottleneckResult["severity"], string> = {
  none: "text-[var(--mint)]",
  mild: "text-[var(--cyan)]",
  moderate: "text-[var(--warn)]",
  severe: "text-[var(--danger)]",
};

export function BottleneckPanel({ gpuName, cpuName }: Props) {
  const { t } = useI18n();
  const [resolution, setResolution] = useState<BottleneckResolution>("1080");
  const result = useMemo(
    () => estimateBottleneck({ cpuName, gpuName, resolution }),
    [cpuName, gpuName, resolution],
  );

  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="section-title text-lg">{t("builder.bottleneckTitle")}</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{t("builder.bottleneckHint")}</p>

      {!result ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">{t("builder.bottleneckNeedBoth")}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {BOTTLENECK_RESOLUTIONS.map((res) => (
              <button
                key={res}
                type="button"
                onClick={() => setResolution(res)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  resolution === res
                    ? "bg-[var(--mint)] text-[#041018]"
                    : "bg-[rgba(52,211,153,0.1)] text-[var(--text-muted)]"
                }`}
              >
                {t(`builder.bottleneckRes.${res}`)}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(7,11,18,0.45)] p-4">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {t("builder.bottleneckIdentified")}
            </p>
            <p className="mt-1 text-xs text-[var(--text)]">
              {result.cpu.label}
              <span className="text-[var(--text-muted)]"> · </span>
              {result.gpu.label}
            </p>
            {(result.cpu.confidence === "fallback" || result.gpu.confidence === "fallback") && (
              <p className="mt-1 text-[10px] text-[var(--warn)]">{t("builder.bottleneckUnknown")}</p>
            )}

            <p className={`mt-3 text-sm font-semibold ${severityClass[result.severity]}`}>
              {result.side === "balanced"
                ? t("builder.bottleneckBalanced")
                : result.side === "cpu"
                  ? t("builder.bottleneckCpu", { percent: result.percent })
                  : t("builder.bottleneckGpu", { percent: result.percent })}
              <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                {t(`builder.bottleneckSeverity.${result.severity}`)}
              </span>
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {result.side === "balanced"
                ? t("builder.bottleneckBalancedHint")
                : result.side === "cpu"
                  ? t("builder.bottleneckCpuHint")
                  : t("builder.bottleneckGpuHint")}
            </p>

            <div className="mt-4 space-y-3">
              <UtilBar
                label={t("builder.bottleneckCpuUtil")}
                value={result.cpuUtil}
                limited={result.side === "cpu"}
              />
              <UtilBar
                label={t("builder.bottleneckGpuUtil")}
                value={result.gpuUtil}
                limited={result.side === "gpu"}
              />
            </div>

            <div className="mt-4">
              <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <span>{t("builder.bottleneckScaleCpu")}</span>
                <span>{t("builder.bottleneckScaleGpu")}</span>
              </div>
              <div className="relative h-2 rounded-full bg-gradient-to-r from-[var(--danger)] via-[var(--mint)] to-[var(--warn)]">
                <div
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--text)] bg-[var(--bg-deep)] shadow"
                  style={{ left: `${result.balance}%` }}
                />
              </div>
            </div>

            <p className="mt-3 text-xs text-[var(--text-muted)]">
              {result.side === "balanced"
                ? t("builder.bottleneckAdvice.balanced")
                : result.side === "cpu"
                  ? t("builder.bottleneckAdvice.cpu")
                  : t("builder.bottleneckAdvice.gpu")}
            </p>
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-muted)]">
            {t("builder.bottleneckDisclaimer")}
          </p>
        </>
      )}
    </div>
  );
}

function UtilBar({
  label,
  value,
  limited,
}: {
  label: string;
  value: number;
  limited: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={limited ? "font-semibold text-[var(--danger)]" : "text-[var(--text-muted)]"}>
          {label}
        </span>
        <span className="tabular-nums text-[var(--text)]">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[rgba(148,163,184,0.15)]">
        <div
          className={`h-full rounded-full transition-all ${limited ? "bg-[var(--danger)]" : "bg-[var(--cyan)]"}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
