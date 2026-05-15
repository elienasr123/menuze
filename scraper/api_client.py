"""
Fetches all Toters restaurants and menus using the discovered API.

Run: python api_client.py --analyze          # inspect captured calls + location coverage
     python api_client.py --fetch            # fetch everything into toters_data.json
     python api_client.py --resume           # continue from last checkpoint
     python api_client.py --fetch-stores     # only collect store list (fast), no menus
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

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

load_dotenv()

BASE_URL = "https://api.toters-api.com"
CAPTURED_FILE = "toters_captured.json"
OUTPUT_FILE = "toters_data.json"
STORES_FILE = "toters_stores.json"   # intermediate: all unique store stubs


def load_captured() -> list[dict]:
    with open(CAPTURED_FILE, encoding="utf-8") as f:
        return json.load(f)


# ── Location header extraction ────────────────────────────────────────────────

def extract_location_sessions(calls: list[dict]) -> list[dict]:
    """
    Return one headers-dict per distinct /api/home/stores call found in the
    capture.  Each call was made from a different delivery address, so using
    all of them maximises restaurant coverage.
    """
    sessions = []
    seen_lat = set()

    for call in calls:
        if "/api/home/stores" not in call.get("url", ""):
            continue
        h = dict(call.get("request_headers", {}))

        # Try to get a location fingerprint from common header names
        lat_key = next((k for k in h if "lat" in k.lower()), None)
        lon_key = next((k for k in h if "lon" in k.lower() or "lng" in k.lower()), None)
        loc_key = next((k for k in h if "location" in k.lower() or "address" in k.lower()), None)

        fingerprint = (
            h.get(lat_key, "") if lat_key else
            h.get(loc_key, "") if loc_key else
            call.get("url", "")[:120]
        )

        if fingerprint not in seen_lat:
            seen_lat.add(fingerprint)
            lat = h.get(lat_key, "?") if lat_key else "?"
            lon = h.get(lon_key, "?") if lon_key else "?"
            sessions.append({"headers": h, "lat": lat, "lon": lon})

    # Fallback: use headers from any call if no stores call was found
    if not sessions:
        for call in calls:
            if call.get("request_headers"):
                sessions.append({"headers": dict(call["request_headers"]), "lat": "?", "lon": "?"})
                break

    return sessions


# ── Store list fetching ───────────────────────────────────────────────────────

def fetch_stores_for_session(client: httpx.Client, session_label: str) -> list[dict]:
    """Paginate /api/home/stores for one location session."""
    stores = []
    page = 1
    last_page = None

    while True:
        print(f"    [{session_label}] page {page}{f'/{last_page}' if last_page else ''}...")
        try:
            r = client.get("/api/home/stores", params={"page": page})
            r.raise_for_status()
        except Exception as e:
            print(f"    ERROR on page {page}: {e}")
            break

        body = r.json()
        stores_obj = body.get("data", {}).get("stores", {})

        if isinstance(stores_obj, dict):
            batch = stores_obj.get("data") or []
            if last_page is None:
                last_page = stores_obj.get("last_page")
                total = stores_obj.get("total", "?")
                print(f"    Total on this location: {total} stores across {last_page} pages")
        elif isinstance(stores_obj, list):
            batch = stores_obj
        else:
            break

        if not batch:
            break

        stores.extend(batch)

        if last_page and page >= last_page:
            break

        page += 1
        time.sleep(random.uniform(0.8, 1.5))

    return stores


def collect_all_stores(sessions: list[dict]) -> list[dict]:
    """
    Run fetch_stores_for_session for every captured location, deduplicate by
    store ID, return the merged list.
    """
    seen_ids: set = set()
    all_stores: list[dict] = []

    print(f"\nCollecting stores from {len(sessions)} captured location(s)...\n")

    for i, session in enumerate(sessions):
        label = f"location {i+1}/{len(sessions)} lat={session['lat']} lon={session['lon']}"
        print(f"  {label}")

        with httpx.Client(base_url=BASE_URL, headers=session["headers"], timeout=20) as client:
            stores = fetch_stores_for_session(client, label)

        new = 0
        for s in stores:
            sid = str(s.get("id") or s.get("store_id") or "")
            if sid and sid not in seen_ids:
                seen_ids.add(sid)
                all_stores.append(s)
                new += 1

        print(f"  → {new} new stores (running total: {len(all_stores)})\n")

    return all_stores


# ── Menu fetching ─────────────────────────────────────────────────────────────

def extract_items_from_cat(cat: dict) -> tuple[str, list]:
    cat_name = cat.get("ref") or cat.get("name") or "Uncategorized"
    if cat.get("items"):
        return cat_name, cat["items"]
    all_items = []
    for sub in cat.get("sub") or []:
        if isinstance(sub, dict):
            all_items.extend(sub.get("items") or [])
    return cat_name, all_items


def fetch_store_menu(client: httpx.Client, store_id: int | str) -> list[dict]:
    all_items = []

    try:
        r = client.get(f"/api/mobile/stores/{store_id}/additional-categories")
        r.raise_for_status()
        data = r.json().get("data", {})
    except Exception as e:
        print(f"  additional-categories error: {e}")
        data = {}

    if isinstance(data, dict):
        cats = data.get("subcategories") or data.get("categories") or []
    elif isinstance(data, list):
        cats = data
    else:
        cats = []

    for cat in cats:
        if isinstance(cat, dict):
            cat_name, items = extract_items_from_cat(cat)
            all_items.extend(normalize_items(items, cat_name))

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
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = item.get("ref") or item.get("name") or item.get("title") or ""
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
            "price_lbp": price_lbp,
            "price_usd": price_usd,
            "currency": "LBP",
            "description": item.get("description") or item.get("desc") or "",
            "image_url": item.get("image") or item.get("image_url") or (item.get("imgs") or [""])[0],
            "category": category,
        })
    return [i for i in result if i["name"]]


# ── Main fetch logic ──────────────────────────────────────────────────────────

def fetch_all(sessions: list[dict], resume: bool = False):
    # Load already-fetched stores when resuming
    if resume and Path(OUTPUT_FILE).exists():
        with open(OUTPUT_FILE, encoding="utf-8") as f:
            results = json.load(f)
        done_ids = {r["id"] for r in results}
        print(f"Resuming — {len(results)} stores already saved, skipping those.")
    else:
        results = []
        done_ids = set()

    # Get store list from all locations
    all_stores = collect_all_stores(sessions)

    # Save store list for inspection
    with open(STORES_FILE, "w", encoding="utf-8") as f:
        json.dump([{
            "id": str(s.get("id") or s.get("store_id")),
            "name": s.get("ref") or s.get("name") or "",
        } for s in all_stores], f, ensure_ascii=False, indent=2)
    print(f"Saved {len(all_stores)} unique store stubs to {STORES_FILE}")

    # Use first session's headers for menu fetching (auth token is the same)
    menu_headers = sessions[0]["headers"]

    with httpx.Client(base_url=BASE_URL, headers=menu_headers, timeout=20) as client:
        for i, store in enumerate(all_stores):
            sid = str(store.get("id") or store.get("store_id") or "")
            name = store.get("ref") or store.get("name") or store.get("title") or ""
            logo = store.get("picture") or store.get("logo") or store.get("image") or ""
            tags = store.get("store_tags") or []
            cuisine = ", ".join(
                t["tag"]["ref"] for t in tags
                if isinstance(t, dict) and (t.get("tag") or {}).get("ref")
            ) or store.get("type") or ""
            lat = store.get("lat") or store.get("latitude")
            lon = store.get("lon") or store.get("longitude")

            if sid in done_ids:
                continue

            print(f"[{i+1}/{len(all_stores)}] {name} (id={sid})")

            try:
                dishes = fetch_store_menu(client, sid)
                print(f"  -> {len(dishes)} dishes")
            except Exception as e:
                print(f"  ERROR: {e}")
                traceback.print_exc()
                dishes = []

            results.append({
                "id": sid,
                "name": name,
                "logo_url": logo,
                "cuisine": cuisine,
                "lat": float(lat) if lat else None,
                "lon": float(lon) if lon else None,
                "dishes": dishes,
            })

            if (i + 1) % 10 == 0:
                with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                    json.dump(results, f, ensure_ascii=False, indent=2)
                print(f"  [checkpoint — {i+1} done]")

            time.sleep(random.uniform(1.5, 3.0))

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    total_dishes = sum(len(r["dishes"]) for r in results)
    print(f"\nDone. {len(results)} restaurants, {total_dishes} dishes → {OUTPUT_FILE}")


def analyze(calls: list[dict]):
    sessions = extract_location_sessions(calls)
    stores_calls = [c for c in calls if "/api/home/stores" in c.get("url", "")]

    print(f"\n{'='*60}")
    print(f"Total captured calls : {len(calls)}")
    print(f"/api/home/stores calls: {len(stores_calls)}")
    print(f"Distinct locations   : {len(sessions)}")
    print(f"{'='*60}\n")

    for i, s in enumerate(sessions):
        print(f"  Location {i+1}: lat={s['lat']} lon={s['lon']}")

    print(f"\n⚠  The more locations you capture, the more restaurants you get.")
    print(f"   Open Toters → change delivery address to each of these areas:")
    print(f"   Achrafieh, Hamra, Jounieh, Tripoli, Saida, Zahle, Batroun, Jbeil")
    print(f"   Each address change = a new /api/home/stores call captured.\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--analyze", action="store_true", help="Show captured calls summary")
    parser.add_argument("--fetch", action="store_true", help="Fetch all restaurants and menus")
    parser.add_argument("--resume", action="store_true", help="Resume from last checkpoint")
    parser.add_argument("--fetch-stores", action="store_true", help="Only collect store list, no menus")
    args = parser.parse_args()

    calls = load_captured()
    sessions = extract_location_sessions(calls)

    if not sessions:
        print("ERROR: No usable headers found in captured calls.")
        print("Re-run mitmproxy and browse Toters while logged in.")
        sys.exit(1)

    if args.analyze:
        analyze(calls)
    elif args.fetch_stores:
        stores = collect_all_stores(sessions)
        with open(STORES_FILE, "w", encoding="utf-8") as f:
            json.dump([{"id": str(s.get("id") or ""), "name": s.get("ref") or s.get("name") or ""} for s in stores], f, ensure_ascii=False, indent=2)
        print(f"\n{len(stores)} unique stores saved to {STORES_FILE}")
    elif args.fetch or args.resume:
        print(f"Found {len(sessions)} location session(s) in capture.")
        fetch_all(sessions, resume=args.resume)
    else:
        parser.print_help()
