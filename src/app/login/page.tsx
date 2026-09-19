"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/LanguageProvider";
import { safeNextPath } from "@/lib/clientAuth";

function LoginInner() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || t("login.error"));
      return;
    }

    const next = safeNextPath(params.get("next"), "/");
    if (data.user?.role === "admin" || data.user?.role === "head_admin") {
      router.push(next.startsWith("/admin") || next === "/" ? "/admin" : next);
    } else {
      router.push(next === "/" ? "/" : next);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="glass rounded-2xl p-6">
        <h1 className="section-title text-2xl text-[var(--cyan)]">AXON.MK</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {mode === "login" ? t("login.titleLogin") : t("login.titleRegister")}
        </p>
        {params.get("next") && (
          <p className="mt-2 text-xs text-[var(--mint)]">{t("login.requiredToBuy")}</p>
        )}

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
          <button type="submit" className="btn btn-primary w-full">
            {mode === "login" ? t("login.submitLogin") : t("login.submitRegister")}
          </button>
        </form>

        <button
          className="mt-4 text-sm text-[var(--cyan)]"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
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
