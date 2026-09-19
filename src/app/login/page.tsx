"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/LanguageProvider";
import { safeNextPath } from "@/lib/clientAuth";

const AUTH_ERROR_KEYS: Record<string, string> = {
  INVALID_CREDENTIALS: "login.invalidCredentials",
  EMAIL_EXISTS: "login.emailExists",
  EMAIL_NOT_VERIFIED: "login.emailNotVerified",
  CODE_INVALID: "login.codeInvalid",
  CODE_EXPIRED: "login.codeExpired",
  RESEND_WAIT: "login.resendWait",
  "Погрешни податоци": "login.invalidCredentials",
  "Email веќе постои": "login.emailExists",
};

function authErrorMessage(code: unknown, t: (key: string) => string) {
  if (typeof code === "string" && AUTH_ERROR_KEYS[code]) {
    return t(AUTH_ERROR_KEYS[code]);
  }
  return t("login.error");
}

function LoginInner() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "register" | "verify">("login");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendWait, setResendWait] = useState(0);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  useEffect(() => {
    if (resendWait <= 0) return;
    const id = window.setTimeout(() => setResendWait((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [resendWait]);

  function goAfterAuth(role?: string) {
    const next = safeNextPath(params.get("next"), "/");
    if (role === "admin" || role === "head_admin") {
      router.push(next.startsWith("/admin") || next === "/" ? "/admin" : next);
    } else {
      router.push(next === "/" ? "/" : next);
    }
  }

  function startVerify(email: string, waitSeconds?: number) {
    setPendingEmail(email);
    setCode("");
    setError("");
    setInfo("");
    setResendWait(typeof waitSeconds === "number" ? waitSeconds : 60);
    setMode("verify");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (data.needsVerification || data.error === "EMAIL_NOT_VERIFIED") {
        startVerify(data.email || form.email, data.retryAfter);
        return;
      }
      if (!res.ok) {
        setError(authErrorMessage(data.error, t));
        return;
      }
      goAfterAuth(data.user?.role);
    } catch {
      setError(t("login.error"));
    } finally {
      setBusy(false);
    }
  }

  async function submitVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(authErrorMessage(data.error, t));
        return;
      }
      goAfterAuth(data.user?.role);
    } catch {
      setError(t("login.error"));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (resendWait > 0 || busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResendWait(typeof data.retryAfter === "number" ? data.retryAfter : 60);
        setError(authErrorMessage(data.error, t));
        return;
      }
      setInfo(t("login.verifyResent"));
      setResendWait(60);
    } catch {
      setError(t("login.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="glass rounded-2xl p-6">
        <h1 className="section-title text-2xl text-[var(--cyan)]">AXON.MK</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {mode === "login"
            ? t("login.titleLogin")
            : mode === "register"
              ? t("login.titleRegister")
              : t("login.verifyTitle")}
        </p>
        {mode !== "verify" && params.get("next") === "/account" ? (
          <p className="mt-2 text-xs text-[var(--mint)]">{t("login.requiredForProfile")}</p>
        ) : mode !== "verify" && params.get("next") ? (
          <p className="mt-2 text-xs text-[var(--mint)]">{t("login.requiredToBuy")}</p>
        ) : null}

        {mode === "verify" ? (
          <form onSubmit={submitVerify} className="mt-6 space-y-3">
            <p className="text-sm text-[var(--text-muted)]">
              {t("login.verifyHint", { email: pendingEmail })}
            </p>
            <div>
              <label className="label">{t("login.verifyCode")}</label>
              <input
                className="input tracking-[0.35em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                pattern="\d{6}"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
            {info && <p className="text-sm text-[var(--mint)]">{info}</p>}
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <button type="submit" className="btn btn-primary w-full" disabled={busy || code.length !== 6}>
              {t("login.verifySubmit")}
            </button>
            <button
              type="button"
              className="w-full text-sm text-[var(--cyan)] disabled:text-[var(--text-muted)]"
              disabled={busy || resendWait > 0}
              onClick={resend}
            >
              {resendWait > 0 ? t("login.verifyWait", { seconds: resendWait }) : t("login.verifyResend")}
            </button>
          </form>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            {mode === "register" && (
              <>
                <div>
                  <label className="label">{t("login.name")}</label>
                  <input
                    className="input"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">{t("login.phone")}</label>
                  <input
                    className="input"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </>
            )}
            <div>
              <label className="label">{t("login.email")}</label>
              <input
                className="input"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t("login.password")}</label>
              <input
                className="input"
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {mode === "login" ? t("login.submitLogin") : t("login.submitRegister")}
            </button>
          </form>
        )}

        <button
          className="mt-4 text-sm text-[var(--cyan)]"
          onClick={() => {
            setError("");
            setInfo("");
            setMode(mode === "login" ? "register" : "login");
          }}
        >
          {mode === "login" ? t("login.switchToRegister") : t("login.switchToLogin")}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<div className="p-10 text-[var(--text-muted)]">{t("prebuilts.loading")}</div>}>
      <LoginInner />
    </Suspense>
  );
}
