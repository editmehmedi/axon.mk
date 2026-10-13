"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "./LanguageProvider";

type Turn = { role: "user" | "assistant"; content: string };

const LINK = /(https?:\/\/[^\s)]+|\/(?:configurator|ai-build|prebuilts|used-parts|used|sell|chat)\b)/g;

function MessageText({ text }: { text: string }) {
  const parts = text.split(LINK);
  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        if (/^https?:\/\//.test(part)) {
          return (
            <a key={index} href={part} className="underline decoration-[var(--cyan)]/50" target="_blank" rel="noreferrer">
              {part}
            </a>
          );
        }
        if (part.startsWith("/")) {
          return (
            <a key={index} href={part} className="text-[var(--cyan)] underline decoration-[var(--cyan)]/40">
              {part}
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

export function ItChat() {
  const { locale, t } = useI18n();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Turn[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const started = messages.length > 0;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const history = [...messages, { role: "user" as const, content }].slice(-16);
    setMessages(history);
    setDraft("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          messages: history.map((message) => ({ role: message.role, content: message.content })),
        }),
      });
      if (response.status === 503) {
        setMessages((current) => [...current, { role: "assistant", content: t("chat.offline") }]);
        return;
      }
      if (response.status === 429) {
        setMessages((current) => [...current, { role: "assistant", content: t("chat.rate") }]);
        return;
      }
      if (!response.ok || !response.body) {
        setMessages((current) => [...current, { role: "assistant", content: t("chat.error") }]);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      setMessages((current) => [...current, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        const next = reply;
        setMessages((current) => {
          const copy = [...current];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") copy[copy.length - 1] = { role: "assistant", content: next };
          return copy;
        });
      }
      if (!reply.trim()) {
        setMessages((current) => {
          const copy = [...current];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant" && !last.content.trim()) {
            copy[copy.length - 1] = { role: "assistant", content: t("chat.error") };
          }
          return copy;
        });
      }
    } catch {
      setMessages((current) => {
        const last = current[current.length - 1];
        if (last?.role === "assistant" && last.content.trim()) return current;
        const base = last?.role === "assistant" ? current.slice(0, -1) : current;
        return [...base, { role: "assistant", content: t("chat.error") }];
      });
    } finally {
      setBusy(false);
    }
  }

  const suggestions = [t("chat.suggest1"), t("chat.suggest2"), t("chat.suggest3")];

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col px-4 py-6 md:px-6 md:py-8" style={{ minHeight: "calc(100dvh - 9rem)" }}>
      <div className="mb-4">
        <h1 className="section-title text-3xl md:text-4xl">{t("chat.title")}</h1>
        <p className="mt-2 text-[var(--text-muted)]">{t("chat.desc")}</p>
      </div>

      <div className="glass-strong flex min-h-[28rem] flex-1 flex-col overflow-hidden rounded-2xl">
        <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {!started ? (
            <div className="max-w-xl">
              <p className="text-sm leading-6 text-[var(--text)]">{t("chat.welcome")}</p>
              <div className="mt-4 flex flex-col gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="rounded-xl border border-[var(--border)] px-3 py-2.5 text-left text-sm text-[var(--text)] transition hover:border-[var(--border-strong)] hover:bg-[rgba(34,211,238,0.08)]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${
                    message.role === "user"
                      ? "bg-[rgba(34,211,238,0.16)] text-[var(--text)]"
                      : "border border-[var(--border)] bg-[rgba(7,11,18,0.45)] text-[var(--text)]"
                  }`}
                >
                  {message.content ? <MessageText text={message.content} /> : <span className="text-[var(--text-muted)]">{t("chat.thinking")}</span>}
                </div>
              </div>
            ))
          )}
        </div>

        <form
          className="flex items-end gap-2 border-t border-[var(--border)] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
            rows={2}
            maxLength={1200}
            placeholder={t("chat.placeholder")}
            className="min-h-12 flex-1 resize-none rounded-xl border border-[var(--border)] bg-[rgba(7,11,18,0.55)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)]"
          />
          <button type="submit" disabled={busy || !draft.trim()} className="btn btn-primary !px-4 !py-2.5">
            {busy ? t("chat.thinking") : t("chat.send")}
          </button>
        </form>
      </div>
    </div>
  );
}
