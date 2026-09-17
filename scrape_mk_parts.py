"""
Scrape CPU / GPU / RAM from Setec, Gjirafa50, and Neptun.

Columns: name, price_mkd, image_url, source, in_stock
  in_stock = yes | no

Laptop / SODIMM RAM and memory cards are excluded.
Gjirafa RAM uses the desktop subcategory (za-klasichen-kompjuter).
"""

from __future__ import annotations

import csv
import html as html_lib
import json
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

REQUEST_DELAY_SEC = 1.0
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

SETEC_SEARCH_URL = "https://search.sp.solslab.dev/indexes/products/search"
SETEC_API_KEY = (
    "c0424dab588b8cbbbe0a4809fc10b5f1c0c7d183b5b28ebe799f3fbf583ab358"
)
SETEC_CATEGORIES = {
    "cpu": "pcat_01JFZ1X9Y3Y9J9551D0N232WJA",
    "gpu": "pcat_01JFZ1XADKJGWY8P4VZ0EV2Z86",
    "ram": "pcat_01JFZ1XAA0XBHR88MGYKMNS8KY",
}

GJIRAFA_CATEGORIES = {
    "cpu": "https://gjirafa50.mk/za-kompjuter-procesor",
    "gpu": "https://gjirafa50.mk/grafichka-karta-kompjuterski-delovi",
    # Desktop / classic PC RAM only (not laptop subcategory)
    "ram": "https://gjirafa50.mk/za-klasichen-kompjuter",
}
GJIRAFA_PAGE_SIZE = 48

NEPTUN_BASE = "https://www.neptun.mk"
NEPTUN_CATEGORIES = {
    "cpu": f"{NEPTUN_BASE}/Procesori.nspx",
    "gpu": f"{NEPTUN_BASE}/Graficki_karticki.nspx",
    "ram": f"{NEPTUN_BASE}/DIMM_(desktop)_memorii.nspx",
}

LAPTOP_OR_CARD_RE = re.compile(
    r"sodimm|so[\s\-]?dimm|laptop|notebook|за\s*лаптоп|per\s*laptop|za\s*laptop|"
    r"оперативна\s*меморија\s*за\s*лаптоп|memorie\s*per\s*laptop|"
    r"microsd|sdxc|sdhc|cfexpress|картичк|memory\s*card|karte\s*memorie|"
    r"sd\s*card|washing|перење|машина\s*за",
    re.I,
)

CSV_FIELDS = ["name", "price_mkd", "image_url", "source", "in_stock"]


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "mk,en;q=0.9"})
    return s


def decode_html_entities(text: str) -> str:
    text = html_lib.unescape(text)
    text = re.sub(
        r"&#x([0-9A-Fa-f]+);",
        lambda m: chr(int(m.group(1), 16)),
        text,
    )
    return text


def parse_price(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return int(round(float(value)))
    text = str(value)
    text = text.replace("\xa0", " ").replace("MKD", "").replace("ден.", "").replace("ден", "")
    text = text.replace(" ", "")
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        parts = text.split(",")
        if len(parts[-1]) == 4 and parts[-1].isdigit():
            text = parts[0]
        elif len(parts[-1]) <= 2:
            text = text.replace(",", ".")
        else:
            text = text.replace(",", "")
    else:
        text = text.replace(".", "") if text.count(".") > 1 else text
    text = re.sub(r"[^\d.]", "", text)
    if not text:
        return None
    try:
        return int(round(float(text)))
    except ValueError:
        return None


def is_laptop_or_card(name: str) -> bool:
    return bool(LAPTOP_OR_CARD_RE.search(name or ""))


def normalize_name(name: str) -> str:
    n = decode_html_entities(name or "").lower()
    n = unicodedata.normalize("NFKD", n)
    n = "".join(ch for ch in n if not unicodedata.combining(ch))
    for prefix in (
        "cpu ",
        "gpu ",
        "ram ",
        "ram dimm ",
        "dimm ",
        "procesor ",
        "процесор ",
        "графичка картичка ",
        "графичка карта ",
        "kartela grafike ",
        "karte grafike ",
        "kartele grafike ",
        "memorie ",
        "меморија ",
        "desktop ram ",
    ):
        if n.startswith(prefix):
            n = n[len(prefix) :]
    n = re.sub(r"[^a-z0-9]+", "", n)
    return n


def looks_like_part(kind: str, name: str) -> bool:
    n = normalize_name(name)
    raw = (name or "").lower()
    if kind == "cpu":
        if re.search(r"\b(cpu\s*)?(cooler|кулер|ладилник|ftohes|thermal\s*paste|термалн)", raw) and not re.search(
            r"(ryzen|core|intel|amd|i[3579]-|ultra\s*\d)", raw
        ):
            return False
        return bool(
            re.search(
                r"(ryzen|corei\d|intelcore|inteli[3579]|celeron|pentium|threadripper|"
                r"ultra[57]|a[468]series|athlon|fx\d|amdryzen|i[3579]\d{4,5})",
                n,
            )
        )
    if kind == "gpu":
        if re.search(r"(cable|kabl|кабел|riser|splitter|adapter|thermal\s*pad|сунѓер|garnitur)", raw):
            return False
        return bool(re.search(r"(rtx\d|gtx\d|rx\d{3,4}|radeon|geforce|arc[ab]\d|quadro)", n))
    if kind == "ram":
        if is_laptop_or_card(name):
            return False
        # Desktop DIMM / DDR modules only
        if not re.search(r"(ddr[345]|dimm)", n):
            return False
        return True
    return True


# ========================= Setec ============================================

def scrape_setec(s: requests.Session, kind: str) -> list[dict[str, Any]]:
    cat_id = SETEC_CATEGORIES[kind]
    rows: list[dict[str, Any]] = []
    page = 1
    total_pages = 1
    while page <= total_pages:
        print(f"  [setec/{kind}] page {page}/{total_pages}")
        payload = {
            "q": "",
            "hitsPerPage": 50,
            "page": page,
            "filter": (
                f"product_categories.id = '{cat_id}' "
                "AND status = 'published' AND is_web_active = 'true'"
            ),
            "sort": ["variants.calculated_price.calculated_amount:asc"],
            "matchingStrategy": "all",
        }
        resp = s.post(
            SETEC_SEARCH_URL,
            headers={
                "Authorization": f"Bearer {SETEC_API_KEY}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json=payload,
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        total_pages = int(data.get("totalPages") or 1)
        hits = data.get("hits") or []
        if not hits:
            break
        for hit in hits:
            title = (hit.get("title") or "").strip()
            brand = (hit.get("brand_name") or "").strip()
            name = (
                f"{brand} {title}".strip()
                if brand and brand.lower() not in title.lower()
                else title
            )
            if kind == "ram" and (is_laptop_or_card(name) or not looks_like_part("ram", name)):
                continue
            price = None
            variants = hit.get("variants") or []
            if variants:
                calc = variants[0].get("calculated_price") or {}
                price = parse_price(calc.get("calculated_amount"))
                if price is None:
                    price = parse_price(calc.get("original_amount"))
            image = (hit.get("thumbnail") or "").strip()
            qty = hit.get("total_web_quantity")
            available = hit.get("is_web_available")
            in_stock = False
            if isinstance(qty, (int, float)):
                in_stock = qty > 0
            elif available is True:
                in_stock = True
            elif available is False:
                in_stock = False
            if name and price is not None:
                rows.append(
                    {
                        "name": name,
                        "price_mkd": price,
                        "image_url": image,
                        "source": "setec",
                        "in_stock": "yes" if in_stock else "no",
                    }
                )
        if page >= total_pages:
            break
        page += 1
        time.sleep(REQUEST_DELAY_SEC)
    return rows


# ========================= Gjirafa50 ========================================

def parse_gjirafa_html(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "lxml")
    rows: list[dict[str, Any]] = []
    for box in soup.select("div.item-box"):
        item = box.select_one("div.product-item")
        if not item:
            continue
        title_el = item.select_one(".product-title, .product-title-lines, a.product-title-lines")
        price_el = item.select_one(".price.main")
        img_el = item.select_one("img")
        link_el = item.select_one("a[href]")
        name = ""
        if title_el:
            name = decode_html_entities(title_el.get_text(" ", strip=True))
        if not name:
            continue
        price = parse_price(item.get("data-discountedprice"))
        if price is None and price_el:
            price = parse_price(price_el.get_text(" ", strip=True))
        img = ""
        if img_el:
            img = img_el.get("src") or img_el.get("srcset") or ""
            if "," in img and " " in img:
                img = img.split(",")[0].strip().split(" ")[0]
            img = re.sub(r"\?width=\d+", "", img)
        href = ""
        if link_el and link_el.get("href"):
            href = urljoin("https://gjirafa50.mk/", link_el["href"])
        if price is None:
            continue
        rows.append(
            {
                "name": name,
                "price_mkd": price,
                "image_url": img,
                "source": "gjirafa50",
                "in_stock": "yes",  # refined below via product page
                "url": href,
            }
        )
    return rows


def gjirafa_product_in_stock(s: requests.Session, url: str) -> bool:
    if not url:
        return True
    try:
        resp = s.get(url, headers={"Accept": "text/html"}, timeout=40)
        if resp.status_code != 200:
            return True
        text = resp.text
        if "schema.org/OutOfStock" in text or "OutOfStock" in text:
            return False
        if "schema.org/InStock" in text or '"inStock":true' in text or '"inStock": true' in text:
            return True
        if re.search(r"нема\s+на\s+залиха|out\s*of\s*stock", text, re.I):
            return False
        if re.search(r"на\s+залиха|во\s+залиха", text, re.I):
            return True
    except requests.RequestException:
        return True
    return True


def enrich_gjirafa_stock(s: requests.Session, rows: list[dict[str, Any]]) -> None:
    urls = [(i, r.get("url") or "") for i, r in enumerate(rows) if r.get("url")]
    if not urls:
        return
    print(f"  [gjirafa] checking stock on {len(urls)} product pages...")

    def check(item: tuple[int, str]) -> tuple[int, bool]:
        idx, url = item
        return idx, gjirafa_product_in_stock(s, url)

    done = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(check, u) for u in urls]
        for fut in as_completed(futures):
            idx, ok = fut.result()
            rows[idx]["in_stock"] = "yes" if ok else "no"
            done += 1
            if done % 25 == 0:
                print(f"    stock checked {done}/{len(urls)}")


def scrape_gjirafa(s: requests.Session, kind: str) -> list[dict[str, Any]]:
    base = GJIRAFA_CATEGORIES[kind]
    all_rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    page = 1
    while page <= 40:
        url = f"{base}?pagesize={GJIRAFA_PAGE_SIZE}&pagenumber={page}"
        print(f"  [gjirafa/{kind}] page {page}")
        resp = s.get(url, headers={"Accept": "text/html"}, timeout=60)
        resp.raise_for_status()
        rows = parse_gjirafa_html(resp.text)
        new = 0
        for row in rows:
            if kind == "ram" and not looks_like_part("ram", row["name"]):
                continue
            if kind != "ram" and not looks_like_part(kind, row["name"]):
                # still keep most, filter obvious junk for gpu/cpu in merge
                pass
            key = normalize_name(row["name"]) + "|" + str(row["price_mkd"])
            if key in seen:
                continue
            seen.add(key)
            all_rows.append(row)
            new += 1
        print(f"    got {len(rows)} kept {new}, total {len(all_rows)}")
        if new == 0 or len(rows) < GJIRAFA_PAGE_SIZE - 5:
            break
        page += 1
        time.sleep(REQUEST_DELAY_SEC)

    enrich_gjirafa_stock(s, all_rows)
    for row in all_rows:
        row.pop("url", None)
    return all_rows


# ========================= Neptun ===========================================

def extract_balanced_array(text: str, start_idx: int) -> str | None:
    i = text.find("[", start_idx)
    if i < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    for j in range(i, min(len(text), i + 3_000_000)):
        ch = text[j]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return text[i : j + 1]
    return None


def scrape_neptun(s: requests.Session, kind: str) -> list[dict[str, Any]]:
    url = NEPTUN_CATEGORIES[kind]
    print(f"  [neptun/{kind}] {url}")
    resp = s.get(url, headers={"Accept": "text/html"}, timeout=60)
    resp.raise_for_status()
    decoded = (
        resp.text.replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
    )

    products: list[dict[str, Any]] = []
    pos = 0
    while True:
        idx = decoded.find('"Products":[', pos)
        if idx < 0:
            break
        arr_text = extract_balanced_array(decoded, idx)
        pos = idx + 12
        if not arr_text:
            continue
        try:
            arr = json.loads(arr_text)
        except json.JSONDecodeError:
            continue
        for p in arr:
            if isinstance(p, dict) and p.get("Title"):
                products.append(p)

    by_id: dict[Any, dict[str, Any]] = {}
    for p in products:
        by_id[p.get("Id")] = p

    rows: list[dict[str, Any]] = []
    for p in by_id.values():
        name = str(p.get("Title") or "").strip()
        if kind == "ram" and (is_laptop_or_card(name) or not looks_like_part("ram", name)):
            continue
        price = parse_price(p.get("ActualPrice"))
        if price is None:
            price = parse_price(p.get("DiscountPrice"))
        if price is None:
            price = parse_price(p.get("RegularPrice"))
        thumb = (p.get("Thumbnail") or p.get("Image") or "").strip()
        image = urljoin(NEPTUN_BASE + "/", thumb) if thumb else ""
        # AvailableOnline is not warehouse stock — treat Neptun as out of stock
        # unless an explicit quantity is present.
        qty = p.get("Quantity") or p.get("AvailableQuantity") or p.get("StockQuantity") or p.get("Stock")
        if isinstance(qty, (int, float)):
            in_stock = qty > 0
        elif isinstance(qty, str) and qty.strip().isdigit():
            in_stock = int(qty.strip()) > 0
        else:
            in_stock = False
        if name and price is not None:
            rows.append(
                {
                    "name": name,
                    "price_mkd": price,
                    "image_url": image,
                    "source": "neptun",
                    "in_stock": "yes" if in_stock else "no",
                }
            )
    print(f"    got {len(rows)}")
    return rows


# ========================= Merge / write ====================================

def write_csv(rows: list[dict[str, Any]], path: str) -> None:
    with open(path, "w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in CSV_FIELDS})


def merge_cheapest(rows: list[dict[str, Any]], kind: str) -> list[dict[str, Any]]:
    best: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not looks_like_part(kind, row["name"]):
            continue
        key = normalize_name(row["name"])
        if not key:
            continue
        prev = best.get(key)
        if prev is None:
            best[key] = row
            continue
        price = int(row["price_mkd"])
        prev_price = int(prev["price_mkd"])
        # Prefer cheaper; if equal price prefer in-stock
        if price < prev_price or (
            price == prev_price
            and row.get("in_stock") == "yes"
            and prev.get("in_stock") != "yes"
        ):
            best[key] = row
    return sorted(best.values(), key=lambda r: (int(r["price_mkd"]), r["name"]))


def main() -> None:
    s = session()
    kinds = ("cpu", "gpu", "ram")
    sources = {
        "setec": scrape_setec,
        "gjirafa": scrape_gjirafa,
        "neptun": scrape_neptun,
    }
    all_by_kind: dict[str, list[dict[str, Any]]] = {k: [] for k in kinds}

    for source_name, scraper in sources.items():
        for kind in kinds:
            print(f"\n=== {source_name} / {kind} ===")
            try:
                rows = scraper(s, kind)
            except Exception as exc:  # noqa: BLE001
                print(f"  ERROR: {exc}")
                rows = []
            plural = {"cpu": "cpus", "gpu": "gpus", "ram": "rams"}[kind]
            out = f"{source_name}_{plural}.csv"
            write_csv(rows, out)
            yes = sum(1 for r in rows if r.get("in_stock") == "yes")
            print(f"  wrote {len(rows)} ({yes} in stock) -> {out}")
            all_by_kind[kind].extend(rows)
            time.sleep(REQUEST_DELAY_SEC)

    print("\n=== merging (keep cheapest duplicate) ===")
    for kind, path in (
        ("cpu", "merged_cpus.csv"),
        ("gpu", "merged_gpus.csv"),
        ("ram", "merged_rams.csv"),
    ):
        merged = merge_cheapest(all_by_kind[kind], kind)
        write_csv(merged, path)
        yes = sum(1 for r in merged if r.get("in_stock") == "yes")
        print(f"  {kind}: {len(all_by_kind[kind])} raw -> {len(merged)} unique ({yes} in stock) -> {path}")


if __name__ == "__main__":
    main()
