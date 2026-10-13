"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/LanguageProvider";
import { isNonePart, type CompatPart, type CompatSelection } from "@/lib/compatibility";

type Props = {
  selection: CompatSelection;
  ramQty: number;
  ssdQty: number;
  partCount: number;
};

type Verdict = "ok" | "warning" | "error";

function slim(part: CompatPart | null | undefined) {
  if (!part) return null;
  return {
    id: part.id,
    category: part.category,
    name: part.name,
    brand: part.brand ?? null,
    socket: part.socket ?? null,
    ramType: part.ramType ?? null,
    wattage: part.wattage ?? null,
    tdpWatts: part.tdpWatts ?? null,
    formFactor: part.formFactor ?? null,
    includesCooler: part.includesCooler ?? null,
  };
}

const verdictClass: Record<Verdict, string> = {
  ok: "text-[var(--mint)]",
  warning: "text-[var(--warn)]",
  error: "text-[var(--danger)]",
};

export function BuildCompatCheck({ selection, ramQty, ssdQty, partCount }: Props) {
  const { t, locale } = useI18n();
  const [text, setText] = useState("");
  const [verdict, setVerdict] = useState<Verdict>("ok");
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const payload = useMemo(() => {
    const ssds = (selection.SSD ?? []).filter((part) => !isNonePart(part));
    return {
      locale,
      ramQty,
      ssdQty,
      selection: {
        CPU: slim(selection.CPU),
        COOLER: slim(selection.COOLER),
        MOTHERBOARD: slim(selection.MOTHERBOARD),
        RAM: slim(selection.RAM),
        GPU: slim(selection.GPU),
        PSU: slim(selection.PSU),
        CASE: slim(selection.CASE),
        SSD: ssds.map((part) => slim(part)),
      },
    };
  }, [locale, ramQty, ssdQty, selection]);

  const signature = JSON.stringify(payload);

  useEffect(() => {
    if (partCount < 2) {
      setPhase("idle");
      setText("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPhase("loading");
      void fetch("/api/build-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: signature,
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(String(response.status));
          const data = (await response.json()) as { text?: string; verdict?: Verdict };
          if (!data.text) throw new Error("empty");
          setText(data.text);
          setVerdict(data.verdict === "error" || data.verdict === "warning" ? data.verdict : "ok");
          setPhase("ready");
        })
        .catch((error: unknown) => {
          if ((error as { name?: string }).name === "AbortError") return;
          setPhase("error");
        });
    }, 700);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [partCount, signature]);

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-3">
      <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{t("builder.aiCompat")}</p>
      {partCount < 2 ? (
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t("builder.aiCompatNeed")}</p>
      ) : phase === "loading" || phase === "idle" ? (
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t("builder.aiCompatChecking")}</p>
      ) : phase === "error" ? (
        <p className="mt-1 text-sm text-[var(--warn)]">{t("builder.aiCompatFailed")}</p>
      ) : (
        <p className={`mt-1 text-sm leading-relaxed ${verdictClass[verdict]}`}>{text}</p>
      )}
    </div>
  );
}
