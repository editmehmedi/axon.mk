"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { CurrencySwitcher } from "./CurrencySwitcher";
import { useI18n } from "./LanguageProvider";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
} | null;

export function Navbar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [user, setUser] = useState<SessionUser>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const NAV = [
    { href: "/prebuilts", label: t("nav.prebuilts") },
    { href: "/used", label: t("nav.used") },
    { href: "/used-parts", label: t("nav.usedParts") },
    { href: "/configurator", label: t("nav.configurator") },
    { href: "/ai-build", label: t("nav.ai") },
    { href: "/sell", label: t("nav.sell") },
    { href: "/orders", label: t("nav.orders") },
  ];

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null));
  }, [pathname]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/";
  }

  return (
    <>
    <header className="sticky top-0 z-[80] border-b border-[var(--border)] bg-[rgba(7,11,18,0.9)] backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-4 md:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            aria-label={menuOpen ? t("nav.closeMenu") : t("nav.menu")}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
              menuOpen
                ? "border border-[var(--border-strong)] bg-[rgba(34,211,238,0.14)] text-[var(--cyan)]"
                : "text-[var(--text)] hover:bg-[rgba(34,211,238,0.1)] hover:text-[var(--cyan)]"
            }`}
          >
            <span className="sr-only">{menuOpen ? t("nav.closeMenu") : t("nav.menu")}</span>
            {menuOpen ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M3.5 3.5l9 9M12.5 3.5l-9 9"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
                <path
                  d="M1 1.5h16M1 7h16M1 12.5h16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>

          <Link href="/" className="shrink-0" onClick={() => setMenuOpen(false)}>
            <span className="section-title text-xl tracking-[0.08em] text-[var(--cyan)] md:text-2xl">
              AXON.MK
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            <div className="mr-1.5 hidden items-center gap-1.5 md:flex">
              <CurrencySwitcher />
              <LanguageSwitcher />
            </div>
            <Link
              href="/orders"
              className={`mr-1.5 inline-flex items-center justify-center whitespace-nowrap rounded-[0.65rem] border px-3.5 py-2 text-xs font-semibold md:hidden ${
                pathname.startsWith("/orders")
                  ? "border-[rgba(34,211,238,0.45)] bg-[rgba(34,211,238,0.14)] text-[var(--cyan)]"
                  : "border-[var(--border)] bg-[rgba(34,211,238,0.06)] text-[var(--text)]"
              }`}
            >
              {t("nav.orders")}
            </Link>
            {user ? (
              <button
                onClick={logout}
                className="btn btn-ghost !whitespace-nowrap !px-3.5 !py-2 !text-xs"
              >
                {t("nav.logout")}
              </button>
            ) : (
              <Link
                href="/login"
                className="btn btn-ghost !whitespace-nowrap !px-3.5 !py-2 !text-xs"
              >
                {t("nav.login")}
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>

      {menuOpen && (
        <button
          type="button"
          aria-label={t("nav.closeMenu")}
          className="fixed inset-0 z-[70] bg-black/55"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <nav
        id="site-menu"
        aria-hidden={!menuOpen}
        inert={!menuOpen}
        className={`fixed inset-y-0 left-0 z-[75] flex w-[min(20rem,86vw)] flex-col border-r border-[var(--border)] bg-[rgba(8,13,22,0.98)] p-4 pt-20 shadow-[20px_0_50px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-transform duration-200 ease-out ${
          menuOpen ? "translate-x-0" : "pointer-events-none -translate-x-full"
        }`}
      >
        <div className="mb-4 space-y-4 border-b border-[var(--border)] pb-4 md:hidden">
          <div>
            <p className="mb-2 px-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
              {t("currency.label")}
            </p>
            <CurrencySwitcher full />
          </div>
          <div>
            <p className="mb-2 px-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
              {t("lang.label")}
            </p>
            <LanguageSwitcher full />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-3 py-3 text-base font-medium transition ${
                  active
                    ? "bg-[rgba(34,211,238,0.14)] text-[var(--cyan)]"
                    : "text-[var(--text)] hover:bg-[rgba(34,211,238,0.08)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {user && (
            <Link
              href="/account"
              className={`rounded-xl px-3 py-3 text-base font-medium transition ${
                pathname.startsWith("/account")
                  ? "bg-[rgba(34,211,238,0.14)] text-[var(--cyan)]"
                  : "text-[var(--text)] hover:bg-[rgba(34,211,238,0.08)]"
              }`}
            >
              {t("nav.profile")}
            </Link>
          )}
          {(user?.role === "admin" || user?.role === "head_admin") && (
            <Link
              href="/admin"
              className={`rounded-xl px-3 py-3 text-base font-medium transition ${
                pathname.startsWith("/admin")
                  ? "bg-[rgba(34,211,238,0.14)] text-[var(--cyan)]"
                  : "text-[var(--text)] hover:bg-[rgba(34,211,238,0.08)]"
              }`}
            >
              {t("nav.admin")}
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
