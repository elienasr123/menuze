"""
Loads toters_data.json into Supabase using PostgreSQL full-text search.
No OpenAI key needed.

Run: python embedder.py
"""

import json
import os
import sys
import io
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

engine = create_engine(
    os.getenv("DATABASE_URL"),
    connect_args={
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 5,
        "keepalives_count": 5,
        "connect_timeout": 30,
    },
    pool_pre_ping=True,
)


def load_into_db(data_file: str = "toters_data.json"):
    with open(data_file, encoding="utf-8") as f:
        restaurants = json.load(f)

    with engine.connect() as conn:
        # Tables
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS restaurants (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                logo_url TEXT,
                cuisine TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS dishes (
                id SERIAL PRIMARY KEY,
                restaurant_id TEXT REFERENCES restaurants(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                price_lbp NUMERIC DEFAULT 0,
                price_usd NUMERIC DEFAULT 0,
                currency TEXT DEFAULT 'LBP',
                description TEXT DEFAULT '',
                image_url TEXT DEFAULT '',
                category TEXT DEFAULT '',
                search_vector TSVECTOR,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))

        # Full-text search index
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS dishes_search_idx
            ON dishes USING GIN (search_vector)
        """))

        # Trigram index for partial matching (e.g. "burg" matches "burger")
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS dishes_name_trgm_idx
            ON dishes USING GIN (name gin_trgm_ops)
        """))

        conn.commit()

        # Upsert restaurants
        print(f"Loading {len(restaurants)} restaurants...")
        for r in restaurants:
            if not r.get("name"):
                continue
            conn.execute(text("""
                INSERT INTO restaurants (id, name, logo_url, cuisine)
                VALUES (:id, :name, :logo_url, :cuisine)
                ON CONFLICT (id) DO UPDATE
                SET name=EXCLUDED.name,
                    logo_url=EXCLUDED.logo_url,
                    cuisine=EXCLUDED.cuisine
            """), {
                "id": r["id"],
                "name": r["name"],
                "logo_url": r.get("logo_url") or "",
                "cuisine": r.get("cuisine") or "",
            })
        conn.commit()
        print(f"  Done.")

        # Load dishes in batches
        all_dishes = []
        for r in restaurants:
            if not r.get("name"):
                continue
            for d in r.get("dishes", []):
                if not d.get("name"):
                    continue
                search_text = " ".join(filter(None, [
                    d.get("name", ""),
                    d.get("category", ""),
                    r["name"],
                ]))[:500]  # keep short to avoid timeouts
                all_dishes.append({
                    "restaurant_id": r["id"],
                    "name": d["name"][:200],
                    "price_lbp": d.get("price_lbp") or d.get("price") or 0,
                    "price_usd": d.get("price_usd") or 0,
                    "currency": "LBP",
                    "description": (d.get("description") or "")[:500],
                    "image_url": d.get("image_url") or "",
                    "category": d.get("category") or "",
                    "search_text": search_text,
                })

        total = len(all_dishes)

        # Check how many already inserted (for resume)
        with engine.connect() as c:
            already = c.execute(text("SELECT COUNT(*) FROM dishes")).scalar()
        start = (already // 100) * 100  # round down to batch boundary
        if start > 0:
            print(f"Resuming from dish {start} ({total - start} remaining)...")
        else:
            print(f"Loading {total} dishes in batches of 100...")

        BATCH = 100
        for i in range(start, total, BATCH):
            batch = all_dishes[i:i + BATCH]
            # Retry up to 5 times with backoff
            for attempt in range(5):
                try:
                    with engine.connect() as c:
                        c.execute(text("""
                            INSERT INTO dishes
                                (restaurant_id, name, price_lbp, price_usd, currency,
                                 description, image_url, category, search_vector)
                            VALUES
                                (:restaurant_id, :name, :price_lbp, :price_usd, :currency,
                                 :description, :image_url, :category,
                                 to_tsvector('simple', :search_text))
                        """), batch)
                        c.commit()
                    break  # success
                except Exception as e:
                    if attempt < 4:
                        wait = 2 ** attempt
                        print(f"  Batch {i}-{i+BATCH} failed ({e.__class__.__name__}), retrying in {wait}s...")
                        time.sleep(wait)
                    else:
                        print(f"  Batch {i}-{i+BATCH} failed after 5 attempts, skipping.")

            if (i // BATCH) % 10 == 0:
                print(f"  {min(i + BATCH, total)}/{total} dishes inserted...")

        print(f"  Done. {total} dishes loaded.")

    print("\nAll done! Database is ready.")


if __name__ == "__main__":
    load_into_db()
