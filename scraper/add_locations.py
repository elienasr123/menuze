"""
Fetches lat/lon for all restaurants from Toters store listing
and updates toters_data.json + the database.

Run: python add_locations.py
"""
import io, json, sys, time, random
from pathlib import Path
import httpx
from dotenv import load_dotenv
import sqlalchemy as sa

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

load_dotenv()
BASE_URL = "https://api.toters-api.com"
DATA_FILE = "toters_data.json"
CAPTURED_FILE = "toters_captured.json"

import os
DATABASE_URL = os.environ["DATABASE_URL"]


def extract_headers():
    with open(CAPTURED_FILE, encoding="utf-8") as f:
        calls = json.load(f)
    for c in calls:
        if "/api/home/stores" in c.get("url", "") and c.get("request_headers"):
            return dict(c["request_headers"])
    for c in calls:
        if c.get("request_headers"):
            return dict(c["request_headers"])
    return {}


def fetch_all_store_coords(headers: dict) -> dict:
    """Returns {store_id: {"lat": ..., "lon": ...}} for all stores."""
    coords = {}
    page = 1
    last_page = None

    with httpx.Client(base_url=BASE_URL, headers=headers, timeout=20) as client:
        while True:
            print(f"  Fetching store page {page}{f'/{last_page}' if last_page else ''}...")
            r = client.get("/api/home/stores", params={"page": page})
            r.raise_for_status()
            body = r.json()
            stores_obj = body.get("data", {}).get("stores", {})
            batch = stores_obj.get("data") or []
            if last_page is None:
                last_page = stores_obj.get("last_page")

            for s in batch:
                sid = str(s.get("id") or s.get("store_id") or "")
                lat = s.get("lat")
                lon = s.get("lon")
                if sid and lat is not None and lon is not None:
                    coords[sid] = {"lat": float(lat), "lon": float(lon)}

            print(f"    {len(batch)} stores, {len(coords)} with coords so far")

            if last_page and page >= last_page:
                break
            page += 1
            time.sleep(random.uniform(0.5, 1.0))

    return coords


def update_json(coords: dict):
    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)

    updated = 0
    for r in data:
        sid = str(r.get("id", ""))
        if sid in coords:
            r["lat"] = coords[sid]["lat"]
            r["lon"] = coords[sid]["lon"]
            updated += 1

    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Updated {updated}/{len(data)} restaurants in {DATA_FILE}")
    return data


def update_database(data: list):
    engine = sa.create_engine(DATABASE_URL)
    with engine.begin() as conn:
        # Add columns if they don't exist
        for col in ["lat", "lon"]:
            try:
                conn.execute(sa.text(f"ALTER TABLE restaurants ADD COLUMN {col} NUMERIC"))
                print(f"Added column: {col}")
            except Exception:
                pass  # already exists

        updated = 0
        for r in data:
            if r.get("lat") is not None:
                conn.execute(sa.text(
                    "UPDATE restaurants SET lat = :lat, lon = :lon WHERE id = :id"
                ), {"lat": r["lat"], "lon": r["lon"], "id": r["id"]})
                updated += 1

        print(f"Updated {updated} restaurants in database")


if __name__ == "__main__":
    print("Fetching coordinates from Toters...")
    headers = extract_headers()
    coords = fetch_all_store_coords(headers)
    print(f"\nGot coordinates for {len(coords)} stores\n")

    print("Updating toters_data.json...")
    data = update_json(coords)

    print("\nUpdating database...")
    update_database(data)

    print("\nDone!")
