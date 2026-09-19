"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LanguageProvider";
import { loginUrl } from "@/lib/clientAuth";

export default function AccountPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [email, setEmail] = useState("");
  const [form, setForm] = useState({ name: "", phone: "" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.user) {
          router.replace(loginUrl("/account"));
          return;
        }
        setEmail(d.user.email ?? "");
        setForm({
          name: d.user.name ?? "",
          phone: d.user.phone ?? "",
        });
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) router.replace(loginUrl("/account"));
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace(loginUrl("/account"));
        return;
      }
      if (!res.ok) {
        setError(
          data.error === "INVALID_NAME" ? t("profile.nameRequired") : t("login.error"),
        );
        return;
      }
      setForm({
        name: data.user?.name ?? form.name,
        phone: data.user?.phone ?? form.phone,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-10 text-center text-[var(--text-muted)]">{t("prebuilts.loading")}</div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="glass rounded-2xl p-6">
        <h1 className="section-title text-2xl text-[var(--cyan)]">{t("profile.title")}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t("profile.desc")}</p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <div>
            <label className="label">{t("login.email")}</label>
            <input className="input opacity-70" value={email} disabled readOnly />
          </div>
          <div>
            <label className="label">{t("login.name")}</label>
            <input
              className="input"
              required
              minLength={2}
              maxLength={80}
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
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          {saved && <p className="text-sm text-[var(--mint)]">{t("profile.saved")}</p>}
          <button type="submit" disabled={saving} className="btn btn-primary w-full">
            {t("profile.save")}
          </button>
        </form>
      </div>
    </div>
  );
}
