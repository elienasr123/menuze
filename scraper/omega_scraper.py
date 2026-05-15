"""
Scrapes all Lebanese restaurants from menu.omegasoftware.ca

Steps:
  1. python omega_scraper.py --slugs       # collect restaurant slugs via Google
  2. python omega_scraper.py --fetch       # fetch all menus
  3. python omega_scraper.py --resume      # resume interrupted fetch
  4. python omega_scraper.py --import-db   # import into menuze PostgreSQL DB
"""

import argparse
import io
import json
import sys
import time
import random
import traceback
from pathlib import Path
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

load_dotenv()

BASE_URL = "https://menu.omegasoftware.ca"
SLUGS_FILE = "omega_slugs.json"
OUTPUT_FILE = "omega_data.json"

BASE_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://menu.omegasoftware.ca",
    "Referer": "https://menu.omegasoftware.ca/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
}


# ── Slug collection ──────────────────────────────────────────────────────────

def collect_slugs_google() -> list[str]:
    """
    Uses googlesearch-python to find all indexed menu.omegasoftware.ca pages.
    Run: pip install googlesearch-python
    """
    try:
        from googlesearch import search
    except ImportError:
        print("ERROR: run  pip install googlesearch-python  first")
        sys.exit(1)

    print("Searching Google for site:menu.omegasoftware.ca ...")
    slugs = set()
    query = "site:menu.omegasoftware.ca"
    try:
        for url in search(query, num_results=500, sleep_interval=2):
            path = urlparse(url).path.strip("/")
            if path and "/" not in path and path.lower() not in ("", "menu", "index"):
                slugs.add(path)
                print(f"  found: {path}")
    except Exception as e:
        print(f"  Google search error: {e}")

    slugs = sorted(slugs)
    print(f"\nTotal slugs found: {len(slugs)}")
    with open(SLUGS_FILE, "w", encoding="utf-8") as f:
        json.dump(slugs, f, ensure_ascii=False, indent=2)
    print(f"Saved to {SLUGS_FILE}")
    return slugs


def load_slugs() -> list[str]:
    if not Path(SLUGS_FILE).exists():
        print(f"ERROR: {SLUGS_FILE} not found. Run --slugs first.")
        sys.exit(1)
    with open(SLUGS_FILE, encoding="utf-8") as f:
        return json.load(f)


# ── Menu fetching ─────────────────────────────────────────────────────────────

def get_csrf_token(client: httpx.Client, slug: str = "KFCLebanon") -> str:
    """Visit a menu page to obtain the Laravel XSRF-TOKEN cookie."""
    from urllib.parse import unquote
    r = client.get(f"/{slug}", headers={"User-Agent": BASE_HEADERS["User-Agent"]})
    token = unquote(r.cookies.get("XSRF-TOKEN", ""))
    return token


def fetch_menu(client: httpx.Client, slug: str, xsrf: str) -> dict:
    headers = {**BASE_HEADERS, "X-XSRF-TOKEN": xsrf, "Referer": f"{BASE_URL}/{slug}"}
    r = client.post("/getRestaurantMenu", json={"customerid": slug, "has_table": 0}, headers=headers)
    r.raise_for_status()
    return r.json()


def normalize(data: dict, slug: str) -> dict:
    branch = data.get("branch") or {}
    brand  = data.get("brand")  or {}

    name   = branch.get("OTHERNAME") or brand.get("BRAND_NAME") or slug
    logo   = brand.get("PICTURE") or ""
    phone  = (branch.get("PHONE1") or branch.get("PHONE2") or
              branch.get("PHONE3") or branch.get("PHONE4") or "")
    lat    = branch.get("LAT")
    lon    = branch.get("LNG")
    instagram = branch.get("url_instagram") or ""
    whatsapp  = branch.get("url_whatsapp")  or ""
    facebook  = branch.get("url_facebook")  or ""
    website   = branch.get("website")       or ""

    dishes = []
    seen_ids = set()

    for category in data.get("menu") or []:
        cat_name = category.get("DESCRIPTION") or "General"
        cat_pic  = category.get("PIC") or ""

        for group in category.get("groups") or []:
            for item in group.get("items") or []:
                item_id = item.get("ID")
                if item_id in seen_ids:
                    continue
                seen_ids.add(item_id)

                price_lbp = item.get("PRICE") or 0
                try:
                    price_lbp = float(str(price_lbp).replace(",", ""))
                except ValueError:
                    price_lbp = 0.0

                item_name = (item.get("ITEMNAME") or "").strip()
                if not item_name or price_lbp <= 0:
                    continue

                dishes.append({
                    "id":          item_id,
                    "name":        item_name,
                    "name_ar":     (item.get("AITEMNAME") or "").strip(),
                    "price_lbp":   price_lbp,
                    "price_usd":   0.0,
                    "currency":    "LBP",
                    "description": (item.get("ITEMDESCRIPTION") or "").strip(),
                    "image_url":   item.get("PIC") or cat_pic or "",
                    "category":    cat_name,
                })

    return {
        "id":        slug,
        "name":      name,
        "logo_url":  logo,
        "cuisine":   "",
        "lat":       float(lat) if lat is not None else None,
        "lon":       float(lon) if lon is not None else None,
        "phone":     str(phone).strip(),
        "instagram": instagram,
        "whatsapp":  whatsapp,
        "facebook":  facebook,
        "website":   website,
        "dishes":    dishes,
        "source":    "omega",
    }


# ── Main fetch loop ───────────────────────────────────────────────────────────

def fetch_all(resume: bool = False):
    slugs = load_slugs()
    results: list[dict] = []
    done_ids: set = set()

    if resume and Path(OUTPUT_FILE).exists():
        with open(OUTPUT_FILE, encoding="utf-8") as f:
            results = json.load(f)
        done_ids = {r["id"] for r in results}
        print(f"Resuming — {len(results)} restaurants already saved, skipping those.")

    with httpx.Client(base_url=BASE_URL, timeout=20) as client:
        print("Getting CSRF token...")
        xsrf = get_csrf_token(client)
        print(f"Got CSRF token ({len(xsrf)} chars)\n")

        print(f"Fetching {len(slugs)} restaurants...\n")
        for i, slug in enumerate(slugs):
            if slug in done_ids:
                continue

            # Refresh CSRF token every 30 restaurants to avoid expiry
            if i > 0 and i % 30 == 0:
                xsrf = get_csrf_token(client, slug)

            print(f"[{i+1}/{len(slugs)}] {slug}")
            try:
                data       = fetch_menu(client, slug, xsrf)
                restaurant = normalize(data, slug)
                results.append(restaurant)
                print(f"  -> {restaurant['name']}: {len(restaurant['dishes'])} dishes")
            except Exception as e:
                print(f"  ERROR: {e}")
                traceback.print_exc()
                results.append({
                    "id": slug, "name": slug, "logo_url": "", "cuisine": "",
                    "lat": None, "lon": None, "phone": "", "instagram": "",
                    "whatsapp": "", "facebook": "", "website": "",
                    "dishes": [], "source": "omega",
                })

            if (i + 1) % 20 == 0:
                _save(results)
                print(f"  [checkpoint — {i+1} done]")

            time.sleep(random.uniform(0.8, 1.5))

    _save(results)
    total_dishes = sum(len(r["dishes"]) for r in results)
    print(f"\nDone. {len(results)} restaurants, {total_dishes} dishes -> {OUTPUT_FILE}")


def _save(results: list):
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


# ── DB import ─────────────────────────────────────────────────────────────────

def import_db():
    import os, psycopg2

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set in .env")
        sys.exit(1)

    if not Path(OUTPUT_FILE).exists():
        print(f"ERROR: {OUTPUT_FILE} not found. Run --fetch first.")
        sys.exit(1)

    with open(OUTPUT_FILE, encoding="utf-8") as f:
        restaurants = json.load(f)

    conn = psycopg2.connect(db_url)
    cur  = conn.cursor()

    inserted_r = 0
    inserted_d = 0
    skipped    = 0

    for r in restaurants:
        if not r["dishes"]:
            skipped += 1
            continue

        rid = r["id"]

        # Upsert restaurant
        cur.execute("""
            INSERT INTO restaurants (id, name, logo_url, cuisine, lat, lon)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                name     = EXCLUDED.name,
                logo_url = EXCLUDED.logo_url,
                lat      = COALESCE(EXCLUDED.lat, restaurants.lat),
                lon      = COALESCE(EXCLUDED.lon, restaurants.lon)
        """, (rid, r["name"], r["logo_url"], r["cuisine"],
              r.get("lat"), r.get("lon")))
        inserted_r += 1

        # Upsert dishes
        for d in r["dishes"]:
            # Generate a unique integer ID: hash restaurant+item into safe int range
            dish_id = abs(hash(f"omega_{rid}_{d['id']}")) % 2_000_000_000 + 1
            cur.execute("""
                INSERT INTO dishes
                    (id, restaurant_id, name, price_lbp, price_usd,
                     currency, description, image_url, category, search_vector)
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    to_tsvector('simple', coalesce(%s,'') || ' ' || coalesce(%s,''))
                )
                ON CONFLICT (id) DO UPDATE SET
                    name        = EXCLUDED.name,
                    price_lbp   = EXCLUDED.price_lbp,
                    price_usd   = EXCLUDED.price_usd,
                    description = EXCLUDED.description,
                    image_url   = EXCLUDED.image_url,
                    category    = EXCLUDED.category,
                    search_vector = EXCLUDED.search_vector
            """, (
                dish_id, rid,
                d["name"], d["price_lbp"], d["price_usd"],
                d["currency"], d["description"], d["image_url"], d["category"],
                d["name"], d["description"],
            ))
            inserted_d += 1

        conn.commit()
        print(f"  {r['name']}: {len(r['dishes'])} dishes")

    cur.close()
    conn.close()

    print(f"\nDone. {inserted_r} restaurants, {inserted_d} dishes imported. {skipped} skipped (no dishes).")


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--slugs",     action="store_true", help="Collect restaurant slugs via Google")
    parser.add_argument("--fetch",     action="store_true", help="Fetch all menus")
    parser.add_argument("--resume",    action="store_true", help="Resume interrupted fetch")
    parser.add_argument("--import-db", action="store_true", dest="import_db", help="Import into PostgreSQL")
    args = parser.parse_args()

    if args.slugs:
        collect_slugs_google()
    elif args.fetch:
        fetch_all(resume=False)
    elif args.resume:
        fetch_all(resume=True)
    elif args.import_db:
        import_db()
    else:
        parser.print_help()
