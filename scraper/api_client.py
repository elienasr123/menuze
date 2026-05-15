"""
Fetches all Toters restaurants and menus using the discovered API.

Run: python api_client.py --analyze    # inspect captured calls
     python api_client.py --fetch      # fetch everything into toters_data.json
"""

import argparse
import io
import json
import sys
from pathlib import Path
import time
import random
import traceback
import httpx
from dotenv import load_dotenv

# Force UTF-8 output regardless of Windows console/redirect encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

load_dotenv()

BASE_URL = "https://api.toters-api.com"
CAPTURED_FILE = "toters_captured.json"
OUTPUT_FILE = "toters_data.json"


def load_captured() -> list[dict]:
    with open(CAPTURED_FILE, encoding="utf-8") as f:
        return json.load(f)


def analyze():
    calls = load_captured()
    print(f"\n{len(calls)} captured calls:\n")
    for c in calls:
        body_keys = list(c["body"].keys()) if isinstance(c["body"], dict) else type(c["body"]).__name__
        print(f"  {c['method']} {c['url']}")
        print(f"    status={c['status']} body_keys={body_keys}")
        print()


def extract_headers(calls: list[dict]) -> dict:
    """Extract all required headers from the captured /api/home/stores request."""
    for call in calls:
        if "/api/home/stores" in call.get("url", ""):
            return dict(call.get("request_headers", {}))
    # Fallback: use headers from any captured call
    for call in calls:
        if call.get("request_headers"):
            return dict(call["request_headers"])
    return {}


def fetch_all_stores(client: httpx.Client) -> list[dict]:
    """Paginate through /api/home/stores to get every restaurant."""
    stores = []
    page = 1
    last_page = None

    while True:
        print(f"  Fetching stores page {page}{f'/{last_page}' if last_page else ''}...")
        r = client.get("/api/home/stores", params={"page": page})
        r.raise_for_status()

        body = r.json()
        stores_obj = body.get("data", {}).get("stores", {})

        # stores_obj can be {"data": [...], "last_page": 26, "total": 761, ...}
        if isinstance(stores_obj, dict):
            batch = stores_obj.get("data") or []
            if last_page is None:
                last_page = stores_obj.get("last_page")
        elif isinstance(stores_obj, list):
            batch = stores_obj
        else:
            break

        if not batch:
            break

        stores.extend(batch)
        print(f"    Got {len(batch)} stores (total so far: {len(stores)})")

        if last_page and page >= last_page:
            break

        page += 1
        time.sleep(random.uniform(1, 2))

    return stores


def extract_items_from_cat(cat: dict) -> tuple[str, list]:
    """Extract (category_name, items) from a category dict, handling nested sub-categories."""
    cat_name = cat.get("ref") or cat.get("name") or "Uncategorized"
    # Direct items
    if cat.get("items"):
        return cat_name, cat["items"]
    # Nested sub-categories: data.categories[].sub[].items[]
    all_items = []
    for sub in cat.get("sub") or []:
        if not isinstance(sub, dict):
            continue
        all_items.extend(sub.get("items") or [])
    return cat_name, all_items


def fetch_store_menu(client: httpx.Client, store_id: int | str) -> list[dict]:
    """Fetch all menu items for a store via subcategories/categories."""
    all_items = []

    try:
        r = client.get(f"/api/mobile/stores/{store_id}/additional-categories")
        r.raise_for_status()
        data = r.json().get("data", {})
    except Exception as e:
        print(f"  additional-categories error: {e}")
        data = {}

    if isinstance(data, dict):
        # Try subcategories first (flat structure), then categories (nested structure)
        cats = data.get("subcategories") or data.get("categories") or []
    elif isinstance(data, list):
        cats = data
    else:
        cats = []

    for cat in cats:
        if not isinstance(cat, dict):
            continue
        cat_name, items = extract_items_from_cat(cat)
        all_items.extend(normalize_items(items, cat_name))

    # Fallback to popular items if nothing found
    if not all_items:
        try:
            r2 = client.get(f"/api/stores/{store_id}/items/popular")
            r2.raise_for_status()
            pop_data = r2.json().get("data", {})
            if isinstance(pop_data, list):
                items = pop_data
            elif isinstance(pop_data, dict):
                items = pop_data.get("items") or pop_data.get("popular") or []
            else:
                items = []
            all_items.extend(normalize_items(items, "Popular"))
        except Exception as e:
            print(f"  popular items error: {e}")

    seen = set()
    unique = []
    for item in all_items:
        key = item.get("id") or item.get("name")
        if key not in seen:
            seen.add(key)
            unique.append(item)

    return unique


def normalize_items(items: list, category: str) -> list[dict]:
    """Normalize raw Toters item objects into our standard format."""
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        # Name: ref (EN) preferred
        name = item.get("ref") or item.get("name") or item.get("title") or ""
        # Price: unit_price is LBP, unit_price_usd is USD
        price_lbp = item.get("unit_price") or item.get("price") or item.get("base_price") or 0
        price_usd = item.get("unit_price_usd") or 0
        try:
            price_lbp = float(str(price_lbp).replace(",", ""))
        except ValueError:
            price_lbp = 0.0
        try:
            price_usd = float(str(price_usd).replace(",", ""))
        except ValueError:
            price_usd = 0.0

        result.append({
            "id": item.get("id"),
            "name": name,
            "name_ar": item.get("ref_ar") or "",
            "price_lbp": price_lbp,
            "price_usd": price_usd,
            "currency": "LBP",
            "description": item.get("description") or item.get("desc") or "",
            "description_ar": item.get("description_ar") or "",
            "image_url": item.get("image") or item.get("image_url") or (item.get("imgs") or [""])[0],
            "category": category,
        })
    return [i for i in result if i["name"]]


def fetch_all(headers: dict, resume: bool = False):
    # Load already-fetched stores if resuming
    if resume and Path(OUTPUT_FILE).exists():
        with open(OUTPUT_FILE, encoding="utf-8") as f:
            results = json.load(f)
        done_ids = {r["id"] for r in results}
        print(f"Resuming — {len(results)} stores already saved, skipping those.")
    else:
        results = []
        done_ids = set()

    with httpx.Client(base_url=BASE_URL, headers=headers, timeout=20) as client:
        print("Fetching all stores...")
        stores = fetch_all_stores(client)
        print(f"\nTotal stores: {len(stores)}\n")

        for i, store in enumerate(stores):
            sid = store.get("id") or store.get("store_id")
            name = store.get("ref") or store.get("name") or store.get("title") or ""
            logo = store.get("picture") or store.get("logo") or store.get("image") or ""
            tags = store.get("store_tags") or []
            cuisine = ", ".join(
                t["tag"]["ref"] for t in tags if isinstance(t, dict) and (t.get("tag") or {}).get("ref")
            ) or store.get("type") or ""

            # Skip already-fetched stores when resuming
            if str(sid) in done_ids:
                continue

            print(f"[{i+1}/{len(stores)}] {name} (id={sid})")

            try:
                dishes = fetch_store_menu(client, sid)
                print(f"  -> {len(dishes)} dishes")
            except Exception as e:
                print(f"  ERROR: {e}")
                traceback.print_exc()
                dishes = []

            results.append({
                "id": str(sid),
                "name": name,
                "logo_url": logo,
                "cuisine": cuisine,
                "dishes": dishes,
            })

            if (i + 1) % 10 == 0:
                with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                    json.dump(results, f, ensure_ascii=False, indent=2)
                print(f"  [checkpoint saved — {i+1} stores]")

            time.sleep(random.uniform(1.5, 3.0))

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    total_dishes = sum(len(r["dishes"]) for r in results)
    print(f"\nDone. {len(results)} restaurants, {total_dishes} dishes -> {OUTPUT_FILE}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--analyze", action="store_true", help="Show captured API calls")
    parser.add_argument("--fetch", action="store_true", help="Fetch all restaurants and menus")
    parser.add_argument("--resume", action="store_true", help="Resume from last checkpoint")
    args = parser.parse_args()

    if args.analyze:
        analyze()
    elif args.fetch or args.resume:
        calls = load_captured()
        headers = extract_headers(calls)
        if not headers:
            print("ERROR: No headers found in captured calls.")
            print("Re-run mitmproxy and make sure you're logged in to the Toters app.")
        else:
            print(f"Using headers from captured session ({len(headers)} headers)")
            fetch_all(headers, resume=args.resume)
    else:
        parser.print_help()
