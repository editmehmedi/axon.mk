"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LanguageSwitcher } from "./LanguageSwitcher";
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

  const NAV = [
    { href: "/prebuilts", label: t("nav.prebuilts") },
    { href: "/used", label: t("nav.used") },
    { href: "/used-parts", label: t("nav.usedParts") },
    { href: "/configurator", label: t("nav.configurator") },
    { href: "/sell", label: t("nav.sell") },
  ];

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null));
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/";
  }

  const ordersActive = pathname.startsWith("/orders");

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[rgba(7,11,18,0.82)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 md:gap-4 md:px-6">
        <Link href="/" className="shrink-0">
          <span className="section-title text-xl tracking-[0.08em] text-[var(--cyan)] md:text-2xl">
            AXON.MK
          </span>
        </Link>

        <nav className="ml-1 hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[rgba(34,211,238,0.12)] text-[var(--cyan)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 md:gap-3">
          <LanguageSwitcher />

          {/* Orders lives in the mobile nav below — hide duplicate on small screens */}
          <Link
            href="/orders"
            className={`btn !hidden !whitespace-nowrap !px-2.5 !py-2 !text-xs md:!inline-flex ${
              ordersActive ? "btn-primary" : "btn-ghost"
            }`}
          >
            <span className="pulse-dot !h-2 !w-2" />
            {t("nav.orders")}
          </Link>

          {user ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              {(user.role === "admin" || user.role === "head_admin") && (
                <Link
                  href="/admin"
                  className="btn btn-ghost !whitespace-nowrap !px-2.5 !py-2 !text-xs"
                >
                  {t("nav.admin")}
                </Link>
              )}
              <button
                onClick={logout}
                className="btn btn-ghost !whitespace-nowrap !px-2.5 !py-2 !text-xs"
              >
                {t("nav.logout")}
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="btn btn-ghost !whitespace-nowrap !px-2.5 !py-2 !text-xs"
            >
              {t("nav.login")}
            </Link>
          )}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-t border-[var(--border)] px-4 py-2 md:hidden">
        {[...NAV, { href: "/orders", label: t("nav.orders") }].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
              pathname.startsWith(item.href)
                ? "bg-[rgba(34,211,238,0.12)] text-[var(--cyan)]"
                : "text-[var(--text-muted)]"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </header>
  );
}
