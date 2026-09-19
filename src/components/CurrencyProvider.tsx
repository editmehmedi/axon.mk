"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_CURRENCY,
  FALLBACK_RATES,
  formatPrice as formatPriceAmount,
  isCurrencyCode,
  type CurrencyCode,
} from "@/lib/currency";

const STORAGE_KEY = "axon_currency";

type Rates = Record<"USD" | "EUR", number>;

type CurrencyContextValue = {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  rates: Rates;
  formatPrice: (amountMkd: number) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [hydrated, setHydrated] = useState(false);
  const [rates, setRates] = useState<Rates>(FALLBACK_RATES);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isCurrencyCode(saved)) setCurrencyState(saved);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, currency);
  }, [currency, hydrated]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/currency")
      .then((r) => r.json())
      .then((data) => {
        const usd = Number(data?.USD);
        const eur = Number(data?.EUR);
        if (cancelled || !(usd > 0) || !(eur > 0)) return;
        setRates({ USD: usd, EUR: eur });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setCurrency = useCallback((code: CurrencyCode) => {
    setCurrencyState(code);
  }, []);

  const formatPrice = useCallback(
    (amountMkd: number) => formatPriceAmount(amountMkd, currency, rates),
    [currency, rates],
  );

  const value = useMemo(
    () => ({ currency, setCurrency, rates, formatPrice }),
    [currency, setCurrency, rates, formatPrice],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
