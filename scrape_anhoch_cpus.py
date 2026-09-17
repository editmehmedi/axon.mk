"""
Scrape Anhoch CPU listings into anhoch_cpus.csv.

Anhoch's storefront is a Vue/FleetCart SPA. Category pages ship a shell;
product cards (div.product-card) are filled via AJAX to products.index.
This scraper:

1. Loads the category HTML and reads product-index attributes with BeautifulSoup
2. Paginates the same AJAX endpoint the site uses
3. Parses each page through BeautifulSoup using the live storefront CSS selectors
   (.product-card, .product-name, .product-price, .product-image img)
"""

from __future__ import annotations

import csv
import html as html_lib
import re
import time
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.anhoch.com"
# Legacy path from the brief returns 404; current category lives here:
CATEGORY_URL = f"{BASE_URL}/categories/procesori/products"
LEGACY_CATEGORY_URL = f"{BASE_URL}/category/3002/processors-cpus"
PRODUCTS_INDEX_URL = f"{BASE_URL}/products"
OUTPUT_CSV = "anhoch_cpus.csv"
REQUEST_DELAY_SEC = 1.0
PER_PAGE = 20

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "mk,en;q=0.9",
}


def absolute_url(src: str | None) -> str:
    if not src:
        return ""
    return urljoin(BASE_URL + "/", src.strip())


def extract_mkd_price(price_text: str) -> str:
    """Normalize price text to a MKD amount string (digits / decimal)."""
    if not price_text:
        return ""
    text = html_lib.unescape(price_text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("\xa0", " ").replace("ден.", "").replace("ден", "")
    text = text.replace("MKD", "").strip()
    # Anhoch formats thousands with '.' and decimals with ','
    text = re.sub(r"[^\d.,]", "", text)
    if not text:
        return ""
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    else:
        text = text.replace(",", "")
    try:
        value = float(text)
        return str(int(value)) if value.is_integer() else f"{value:.2f}"
    except ValueError:
        return text


def discover_category_slug(session: requests.Session) -> str:
    """Parse category slug / id from the live product-index markup."""
    for url in (CATEGORY_URL, LEGACY_CATEGORY_URL):
        resp = session.get(url, headers={**HEADERS, "Accept": "text/html"}, timeout=60)
        if resp.status_code != 200:
            continue
        soup = BeautifulSoup(resp.text, "lxml")
        index = soup.select_one("product-index")
        if not index:
            continue
        slug = (index.get("initial-category-slug") or "").strip()
        if slug:
            print(f"Category slug from product-index: {slug} ({url})")
            return slug
    raise RuntimeError(
        "Could not find product-index[initial-category-slug] on Anhoch category pages."
    )


def cards_html_from_api_payload(payload: dict[str, Any]) -> str:
    """
    Rebuild the storefront product-card markup so BeautifulSoup can use the
    same CSS selectors Vue renders client-side.
    """
    products = (payload.get("products") or {}).get("data") or []
    parts = ['<div class="product-list">']
    for product in products:
        name = html_lib.escape(product.get("name") or "")
        price_html = product.get("formatted_price") or (
            (product.get("selling_price") or {}).get("formatted") or ""
        )
        base_image = product.get("base_image") or {}
        if isinstance(base_image, dict):
            img_path = base_image.get("path") or ""
        else:
            img_path = ""
        img_path = html_lib.escape(img_path)
        slug = product.get("slug") or ""
        href = html_lib.escape(f"{BASE_URL}/products/{slug}" if slug else "#")

        parts.append(
            f'''
            <div class="product-card" title="{name}">
              <div class="product-card-top">
                <a class="product-image" href="{href}">
                  <img src="{img_path}" alt="{name}">
                </a>
              </div>
              <div class="product-card-middle">
                <a class="product-name" href="{href}"><h6>{name}</h6></a>
                <div class="product-price product-price-clone">{price_html}</div>
              </div>
              <div class="product-card-bottom">
                <div class="product-price">{price_html}</div>
              </div>
            </div>
            '''
        )
    parts.append("</div>")
    return "\n".join(parts)


def parse_product_cards(soup: BeautifulSoup) -> list[dict[str, str]]:
    """Extract Name / Price / Image URL using Anhoch storefront CSS selectors."""
    rows: list[dict[str, str]] = []
    for card in soup.select("div.product-card"):
        name_el = card.select_one("a.product-name, .product-name")
        price_el = card.select_one(
            ".product-card-bottom .product-price, .product-price:not(.product-price-clone)"
        ) or card.select_one(".product-price")
        img_el = card.select_one("a.product-image img, .product-image img, img")

        name = ""
        if name_el:
            name = name_el.get_text(" ", strip=True) or (name_el.get("title") or "")
        if not name:
            name = (card.get("title") or "").strip()

        price_mkd = extract_mkd_price(price_el.get_text(" ", strip=True) if price_el else "")
        image_url = absolute_url(img_el.get("src") if img_el else None)

        if name:
            rows.append(
                {
                    "name": name,
                    "price_mkd": price_mkd,
                    "image_url": image_url,
                }
            )
    return rows


def fetch_products_page(
    session: requests.Session, category_slug: str, page: int
) -> tuple[list[dict[str, str]], int | None]:
    """
    Fetch one listing page the same way the storefront AJAX call does, then
    parse cards with BeautifulSoup + CSS selectors.
    """
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
            "Referer": CATEGORY_URL,
        },
        timeout=60,
    )
    resp.raise_for_status()

    content_type = (resp.headers.get("Content-Type") or "").lower()
    last_page: int | None = None

    if "application/json" in content_type:
        payload = resp.json()
        products_meta = payload.get("products") or {}
        last_page = products_meta.get("last_page")
        # Stop signal used by callers: empty data list
        if not products_meta.get("data"):
            return [], last_page
        soup = BeautifulSoup(cards_html_from_api_payload(payload), "lxml")
        return parse_product_cards(soup), last_page

    # HTML fallback (if Anhoch ever SSR's product cards)
    soup = BeautifulSoup(resp.text, "lxml")
    return parse_product_cards(soup), last_page


def scrape_all_cpus() -> list[dict[str, str]]:
    session = requests.Session()
    category_slug = discover_category_slug(session)

    all_rows: list[dict[str, str]] = []
    page = 1

    while True:
        print(f"Fetching page {page}...")
        rows, last_page = fetch_products_page(session, category_slug, page)
        if not rows:
            print("No products on this page — stopping.")
            break

        all_rows.extend(rows)
        print(f"  got {len(rows)} products (total {len(all_rows)})")

        if last_page is not None and page >= last_page:
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
    rows = scrape_all_cpus()
    write_csv(rows)
    print(f"Wrote {len(rows)} CPUs to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
