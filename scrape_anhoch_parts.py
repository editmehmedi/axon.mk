"""
Scrape Anhoch PC-component categories into CSV files.

Columns: name, price_mkd, image_url, in_stock
  in_stock = yes | no  (from Anhoch is_in_stock / qty)
Laptop / SODIMM RAM and memory cards are excluded.
"""

from __future__ import annotations

import argparse
import csv
import re
import time
from typing import Any
from urllib.parse import urljoin

import requests

BASE_URL = "https://www.anhoch.com"
PRODUCTS_INDEX_URL = f"{BASE_URL}/products"
REQUEST_DELAY_SEC = 1.0
PER_PAGE = 20

CATEGORIES: dict[str, tuple[str, str]] = {
    "coolers_fans": ("anhoch_coolers_fans.csv", "ventilatori-i-ladilnici"),
    "motherboards": ("anhoch_motherboards.csv", "matichni-plochi"),
    "rams": ("anhoch_rams.csv", "desktop-ram-memorii"),
    "gpus": ("anhoch_gpus.csv", "grafichki-karti"),
    "psus": ("anhoch_psus.csv", "napojuvanja"),
    "cases": ("anhoch_cases.csv", "kukjishta"),
    "ssds": ("anhoch_ssds.csv", "interni-ssd"),
    "hdds": ("anhoch_hdds.csv", "interni-hdd"),
    "cpus": ("anhoch_cpus.csv", "procesori"),
}

DEFAULT_KEYS = [
    "coolers_fans",
    "motherboards",
    "rams",
    "gpus",
    "psus",
    "cases",
    "ssds",
    "hdds",
    "cpus",
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "mk,en;q=0.9",
}

LAPTOP_OR_CARD_RE = re.compile(
    r"sodimm|so[\s\-]?dimm|laptop|notebook|за\s*лаптоп|per\s*laptop|za\s*laptop|"
    r"microsd|sdxc|sdhc|cfexpress|картичк|memory\s*card|karte\s*memorie|sd\s*card",
    re.I,
)


def absolute_url(src: str | None) -> str:
    if not src:
        return ""
    return urljoin(BASE_URL + "/", src.strip())


def is_laptop_or_card(name: str) -> bool:
    return bool(LAPTOP_OR_CARD_RE.search(name or ""))


def product_in_stock(product: dict[str, Any]) -> bool:
    if product.get("is_out_of_stock") is True:
        return False
    if product.get("is_in_stock") is True or product.get("in_stock") is True:
        return True
    qty = product.get("qty")
    if isinstance(qty, (int, float)):
        return qty > 0
    return False


def parse_products(payload: dict[str, Any], category_key: str) -> list[dict[str, str]]:
    products = (payload.get("products") or {}).get("data") or []
    rows: list[dict[str, str]] = []
    for product in products:
        name = (product.get("name") or "").strip()
        if not name:
            continue
        if category_key == "rams" and is_laptop_or_card(name):
            continue
        price = product.get("selling_price") or product.get("price") or {}
        amount = price.get("amount") if isinstance(price, dict) else None
        if amount is None and isinstance(price, dict):
            amount = (price.get("inCurrentCurrency") or {}).get("amount")
        try:
            price_mkd = str(int(round(float(amount))))
        except (TypeError, ValueError):
            formatted = product.get("formatted_price") or ""
            digits = re.sub(r"[^\d]", "", str(formatted).replace(",", ""))
            if not digits:
                continue
            price_mkd = digits

        base_image = product.get("base_image") or {}
        img = base_image.get("path") if isinstance(base_image, dict) else ""
        rows.append(
            {
                "name": name,
                "price_mkd": price_mkd,
                "image_url": absolute_url(img),
                "in_stock": "yes" if product_in_stock(product) else "no",
            }
        )
    return rows


def fetch_products_page(
    session: requests.Session, category_slug: str, page: int, category_key: str
) -> tuple[list[dict[str, str]], int | None]:
    params = [
        ("categories[]", category_slug),
        ("page", str(page)),
        ("perPage", str(PER_PAGE)),
        ("sort", "latest"),
    ]
    resp = session.get(
        PRODUCTS_INDEX_URL,
        params=params,
        headers={
            **HEADERS,
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": f"{BASE_URL}/categories/{category_slug}/products",
        },
        timeout=60,
    )
    resp.raise_for_status()
    payload = resp.json()
    products_meta = payload.get("products") or {}
    last_page = products_meta.get("last_page")
    if not products_meta.get("data"):
        return [], last_page
    return parse_products(payload, category_key), last_page


def scrape_category(
    session: requests.Session, category_slug: str, label: str
) -> list[dict[str, str]]:
    all_rows: list[dict[str, str]] = []
    page = 1
    while True:
        print(f"  [{label}] page {page}...")
        rows, last_page = fetch_products_page(session, category_slug, page, label)
        if not rows:
            print(f"  [{label}] no products — stopping.")
            break
        all_rows.extend(rows)
        in_yes = sum(1 for r in rows if r["in_stock"] == "yes")
        print(f"  [{label}] got {len(rows)} (in stock {in_yes}) total {len(all_rows)}")
        if last_page is not None and page >= last_page:
            break
        page += 1
        time.sleep(REQUEST_DELAY_SEC)
    return all_rows


def write_csv(rows: list[dict[str, str]], path: str) -> None:
    with open(path, "w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(
            fh, fieldnames=["name", "price_mkd", "image_url", "in_stock"]
        )
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape Anhoch PC parts to CSV")
    parser.add_argument("--only", nargs="+", choices=sorted(CATEGORIES.keys()))
    args = parser.parse_args()
    keys = list(args.only) if args.only else list(DEFAULT_KEYS)

    session = requests.Session()
    for key in keys:
        out_path, slug = CATEGORIES[key]
        print(f"\n=== {key} ({slug}) -> {out_path} ===")
        rows = scrape_category(session, slug, key)
        write_csv(rows, out_path)
        yes = sum(1 for r in rows if r["in_stock"] == "yes")
        print(f"  wrote {len(rows)} ({yes} in stock) -> {out_path}")
        time.sleep(REQUEST_DELAY_SEC)


if __name__ == "__main__":
    main()
