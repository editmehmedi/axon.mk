export type CurrencyCode = "MKD" | "USD" | "EUR";

export const CURRENCIES: { code: CurrencyCode; label: string; native: string }[] = [
  { code: "MKD", label: "Denar", native: "ден" },
  { code: "USD", label: "US Dollar", native: "$" },
  { code: "EUR", label: "Euro", native: "€" },
];

export const DEFAULT_CURRENCY: CurrencyCode = "MKD";

/** Approximate MKD per 1 USD / 1 EUR when live rates are unavailable. */
export const FALLBACK_RATES: Record<"USD" | "EUR", number> = {
  USD: 56.5,
  EUR: 61.5,
};

export function isCurrencyCode(value: string | null | undefined): value is CurrencyCode {
  return value === "MKD" || value === "USD" || value === "EUR";
}

function groupInt(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function convertFromMkd(
  amountMkd: number,
  currency: CurrencyCode,
  rates: Record<"USD" | "EUR", number> = FALLBACK_RATES,
): number {
  const n = Number(amountMkd) || 0;
  if (currency === "MKD") return n;
  const per = rates[currency] || FALLBACK_RATES[currency];
  return per > 0 ? n / per : n;
}

export function formatPrice(
  amountMkd: number,
  currency: CurrencyCode = "MKD",
  rates: Record<"USD" | "EUR", number> = FALLBACK_RATES,
): string {
  const converted = convertFromMkd(amountMkd, currency, rates);
  if (currency === "MKD") {
    const n = Math.round(converted);
    return `${n < 0 ? "-" : ""}${groupInt(Math.abs(n).toString())} ден`;
  }

  const rounded = Math.round(converted * 100) / 100;
  const [intPart, frac = "00"] = Math.abs(rounded).toFixed(2).split(".");
  const body = `${groupInt(intPart)}.${frac}`;
  const sign = rounded < 0 ? "-" : "";
  return currency === "USD" ? `${sign}$${body}` : `${sign}€${body}`;
}
