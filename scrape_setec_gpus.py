"""
Scrape Setec.mk GPU listings into setec_gpus.csv.

Setec's category pages are a Next.js/Medusa storefront. Product lists are loaded
from Meilisearch (same endpoint the website uses):

  POST https://search.sp.solslab.dev/indexes/products/search
  category: Графички Карти (pcat_01JFZ1XADKJGWY8P4VZ0EV2Z86)
  page: https://setec.mk/category/grafichki-20karti-25

CSV columns: name, price_mkd, image_url
"""

from __future__ import annotations

import csv
import time
from typing import Any

import requests

SEARCH_URL = "https://search.sp.solslab.dev/indexes/products/search"
# Public search key shipped to the browser by setec.mk
SEARCH_API_KEY = (
    "c0424dab588b8cbbbe0a4809fc10b5f1c0c7d183b5b28ebe799f3fbf583ab358"
)
GPU_CATEGORY_ID = "pcat_01JFZ1XADKJGWY8P4VZ0EV2Z86"
OUTPUT_CSV = "setec_gpus.csv"
HITS_PER_PAGE = 20
REQUEST_DELAY_SEC = 1.0

HEADERS = {
    "Authorization": f"Bearer {SEARCH_API_KEY}",
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}


def hit_to_row(hit: dict[str, Any]) -> dict[str, str]:
    title = (hit.get("title") or "").strip()
    brand = (hit.get("brand_name") or "").strip()
    name = f"{brand} {title}".strip() if brand and brand.lower() not in title.lower() else title

    price = ""
    variants = hit.get("variants") or []
    if variants:
        calc = (variants[0].get("calculated_price") or {})
        amount = calc.get("calculated_amount")
        if amount is None:
            amount = calc.get("original_amount")
        if amount is not None:
            try:
                value = float(amount)
                price = str(int(value)) if value.is_integer() else f"{value:.2f}"
            except (TypeError, ValueError):
                price = str(amount)

    image_url = (hit.get("thumbnail") or "").strip()
    return {"name": name, "price_mkd": price, "image_url": image_url}


def fetch_page(session: requests.Session, page: int) -> tuple[list[dict[str, str]], int]:
    payload = {
        "q": "",
        "hitsPerPage": HITS_PER_PAGE,
        "page": page,
        "filter": (
            f"product_categories.id = '{GPU_CATEGORY_ID}' "
            "AND status = 'published' AND is_web_active = 'true'"
        ),
        "sort": ["variants.calculated_price.calculated_amount:asc"],
        "matchingStrategy": "all",
        "facets": ["product_categories.id"],
    }
    resp = session.post(SEARCH_URL, headers=HEADERS, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    rows = [hit_to_row(h) for h in (data.get("hits") or []) if h.get("title")]
    total_pages = int(data.get("totalPages") or 1)
    return rows, total_pages


def scrape_gpus() -> list[dict[str, str]]:
    session = requests.Session()
    all_rows: list[dict[str, str]] = []
    page = 1
    total_pages = 1

    while page <= total_pages:
        print(f"Fetching page {page}/{total_pages}...")
        rows, total_pages = fetch_page(session, page)
        if not rows:
            print("No products on this page — stopping.")
            break
        all_rows.extend(rows)
        print(f"  got {len(rows)} (total {len(all_rows)})")
        if page >= total_pages:
            break
        page += 1
        time.sleep(REQUEST_DELAY_SEC)

    return all_rows


def write_csv(rows: list[dict[str, str]], path: str = OUTPUT_CSV) -> None:
    with open(path, "w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=["name", "price_mkd", "image_url"])
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    rows = scrape_gpus()
    write_csv(rows)
    print(f"Wrote {len(rows)} GPUs to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
