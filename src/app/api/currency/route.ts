import { NextResponse } from "next/server";
import { FALLBACK_RATES } from "@/lib/currency";

export const revalidate = 3600;

type EurTable = { eur?: { mkd?: number; usd?: number } };

export async function GET() {
  try {
    const res = await fetch(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json",
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) throw new Error(`rates ${res.status}`);
    const data = (await res.json()) as EurTable;
    const mkdPerEur = Number(data.eur?.mkd);
    const usdPerEur = Number(data.eur?.usd);
    if (mkdPerEur > 20 && mkdPerEur < 120 && usdPerEur > 0.5 && usdPerEur < 2) {
      return NextResponse.json({
        USD: Number((mkdPerEur / usdPerEur).toFixed(4)),
        EUR: Number(mkdPerEur.toFixed(4)),
      });
    }
  } catch (e) {
    console.error("[currency GET]", e);
  }
  return NextResponse.json(FALLBACK_RATES);
}
