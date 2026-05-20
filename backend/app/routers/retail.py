from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from typing import Optional

router = APIRouter(prefix="/retail", tags=["retail"])

# Categories that are restaurant meals, not grocery products.
# Excluded from basket matching to avoid "milk" finding "Milk Caesar Salad".
RESTAURANT_CATEGORIES = (
    "Ready To Eat", "Deli",
)


def build_tsquery(words: list[str]) -> str:
    """Build a simple OR tsquery string from a list of words."""
    return " | ".join(words)


def parse_query(q: str) -> tuple[str, list[str], str]:
    """
    Returns (q_clean, words, tsquery_or_string).
    Multi-word queries use OR logic so 'milk cheese yogurt' finds
    any product containing milk OR cheese OR yogurt.
    """
    q_clean = q.strip().lower()
    words = [w for w in q_clean.split() if len(w) >= 2]
    if not words:
        words = [q_clean]
    tsq = build_tsquery(words)
    return q_clean, words, tsq


@router.get("/search")
def search_products(
    q: str = Query(..., min_length=1),
    platform: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Search retail products across all platforms, balanced per platform."""
    q_clean, words, tsq = parse_query(q)

    # For LIKE matching use the full original query
    like_q = f"%{q_clean}%"
    starts_q = f"{q_clean}%"

    params: dict = {
        "tsq": tsq,
        "q": q_clean,
        "like_q": like_q,
        "starts_q": starts_q,
        "per_platform": 25,
    }

    platform_filter = ""
    if platform:
        platform_filter = "AND platform = :platform"
        params["platform"] = platform

    category_filter = ""
    if category:
        category_filter = "AND category ILIKE :category"
        params["category"] = f"%{category}%"

    rows = db.execute(text(f"""
        WITH ranked AS (
            SELECT id, name, brand, sku, price_usd, image_url,
                   category, subcategory, platform, store_name,
                   CASE
                       WHEN lower(name) = :q                        THEN 5.0
                       WHEN lower(name) LIKE :starts_q              THEN 4.0
                       WHEN lower(name) LIKE '% ' || :q || ' %'     THEN 3.0
                       WHEN lower(name) LIKE '% ' || :q             THEN 2.5
                       ELSE ts_rank(search_vector, to_tsquery('simple', :tsq))
                   END AS rank
            FROM retail_products
            WHERE (
                search_vector @@ to_tsquery('simple', :tsq)
                OR lower(name) LIKE :like_q
            )
            AND price_usd > 0
            {platform_filter}
            {category_filter}
        ),
        per_platform AS (
            SELECT *,
                   ROW_NUMBER() OVER (
                       PARTITION BY platform
                       ORDER BY rank DESC, length(name) ASC, price_usd ASC
                   ) AS rn
            FROM ranked
        )
        SELECT id, name, brand, sku, price_usd, image_url,
               category, subcategory, platform, store_name, rank
        FROM per_platform
        WHERE rn <= :per_platform
        ORDER BY rank DESC, length(name) ASC, price_usd ASC
    """), params).mappings().all()

    return {"results": [dict(r) for r in rows]}


@router.get("/basket")
def compare_basket(
    items: str = Query(..., description="Comma-separated product names"),
    db: Session = Depends(get_db),
):
    """
    Compare total basket cost across platforms.
    For each item, find the cheapest GROCERY match per platform.
    Restaurant-style categories (Ready To Eat, Deli, etc.) are excluded.
    """
    item_names = [i.strip() for i in items.split(",") if i.strip()]
    if not item_names:
        return {"error": "No items provided"}

    # Build exclusion clause using safe parameter binding
    excl_params = {f"excl_{i}": c for i, c in enumerate(RESTAURANT_CATEGORIES)}
    excl_placeholders = ", ".join(f":excl_{i}" for i in range(len(RESTAURANT_CATEGORIES)))
    excl_clause = f"AND category NOT IN ({excl_placeholders})"

    basket = {}  # item_name -> {platform -> best_match}

    for item_name in item_names:
        q_clean, words, tsq = parse_query(item_name)
        params = {
            "tsq": tsq,
            "q": q_clean,
            "like_q": f"%{q_clean}%",
            "starts_q": f"{q_clean}%",
            **excl_params,
        }
        rows = db.execute(text(f"""
            SELECT id, name, brand, price_usd, image_url,
                   category, platform, store_name,
                   CASE
                       WHEN lower(name) = :q                     THEN 5.0
                       WHEN lower(name) LIKE :starts_q           THEN 4.0
                       WHEN lower(name) LIKE '% ' || :q || ' %'  THEN 3.0
                       WHEN lower(name) LIKE '% ' || :q          THEN 2.5
                       ELSE ts_rank(search_vector, to_tsquery('simple', :tsq))
                   END AS rank
            FROM retail_products
            WHERE (
                search_vector @@ to_tsquery('simple', :tsq)
                OR lower(name) LIKE :like_q
            )
            AND price_usd > 0
            {excl_clause}
            ORDER BY rank DESC, length(name) ASC, price_usd ASC
            LIMIT 20
        """), params).mappings().all()

        by_platform: dict = {}
        for row in rows:
            p = row["platform"]
            if p not in by_platform:
                by_platform[p] = dict(row)

        basket[item_name] = by_platform

    # Build platform totals
    all_platforms: set = set()
    for matches in basket.values():
        all_platforms.update(matches.keys())

    platform_items = {}
    for platform in all_platforms:
        total = 0.0
        found_items = []
        missing_items = []
        for item_name, matches in basket.items():
            if platform in matches:
                match = matches[platform]
                total += float(match["price_usd"])
                found_items.append({
                    "searched": item_name,
                    "found": match["name"],
                    "brand": match["brand"],
                    "price_usd": float(match["price_usd"]),
                    "image_url": match["image_url"],
                })
            else:
                missing_items.append(item_name)
        platform_items[platform] = {
            "total": round(total, 2),
            "found": found_items,
            "missing": missing_items,
            "coverage": len(found_items),
        }

    # Best mix: cheapest source per item
    best_mix_total = 0.0
    best_mix_items = []
    for item_name, matches in basket.items():
        if not matches:
            best_mix_items.append({
                "searched": item_name, "found": None,
                "platform": None, "price_usd": None, "image_url": None,
            })
            continue
        best = min(matches.values(), key=lambda x: float(x["price_usd"]))
        best_mix_total += float(best["price_usd"])
        best_mix_items.append({
            "searched": item_name,
            "found": best["name"],
            "brand": best["brand"],
            "platform": best["platform"],
            "price_usd": float(best["price_usd"]),
            "image_url": best["image_url"],
        })

    return {
        "items_searched": item_names,
        "by_platform": platform_items,
        "best_mix": {
            "total": round(best_mix_total, 2),
            "items": best_mix_items,
        },
    }


@router.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    """Get all retail categories with product counts."""
    rows = db.execute(text("""
        SELECT category, platform, COUNT(*) as count
        FROM retail_products
        WHERE price_usd > 0
        GROUP BY category, platform
        ORDER BY count DESC
    """)).mappings().all()
    return {"categories": [dict(r) for r in rows]}
