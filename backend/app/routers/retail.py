from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from typing import Optional
import json

router = APIRouter(prefix="/retail", tags=["retail"])


@router.get("/search")
def search_products(
    q: str = Query(..., min_length=1),
    platform: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Search retail products across all platforms, balanced per platform."""
    q_clean = q.strip().lower()
    params: dict = {
        "q": q_clean,
        "like_q": f"%{q_clean}%",
        "starts_q": f"{q_clean}%",
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
                       ELSE ts_rank(search_vector, plainto_tsquery('simple', :q))
                   END AS rank
            FROM retail_products
            WHERE (
                search_vector @@ plainto_tsquery('simple', :q)
                OR lower(name) LIKE :like_q
            )
            AND price_usd > 0
            {platform_filter}
            {category_filter}
        ),
        per_platform AS (
            SELECT *,
                   ROW_NUMBER() OVER (PARTITION BY platform ORDER BY rank DESC, length(name) ASC, price_usd ASC) AS rn
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
    For each item, find the cheapest match on each platform.
    Returns per-platform totals + best mix.
    """
    item_names = [i.strip() for i in items.split(",") if i.strip()]
    if not item_names:
        return {"error": "No items provided"}

    basket = {}  # item_name -> {platform -> best_match}

    for item_name in item_names:
        q_item = item_name.lower()
        params = {
            "q": q_item,
            "like_q": f"%{q_item}%",
            "starts_q": f"{q_item}%",
        }
        rows = db.execute(text("""
            SELECT id, name, brand, price_usd, image_url,
                   category, platform, store_name,
                   CASE
                       WHEN lower(name) = :q                     THEN 5.0
                       WHEN lower(name) LIKE :starts_q           THEN 4.0
                       WHEN lower(name) LIKE '% ' || :q || ' %'  THEN 3.0
                       WHEN lower(name) LIKE '% ' || :q          THEN 2.5
                       ELSE ts_rank(search_vector, plainto_tsquery('simple', :q))
                   END AS rank
            FROM retail_products
            WHERE (
                search_vector @@ plainto_tsquery('simple', :q)
                OR lower(name) LIKE :like_q
            )
            AND price_usd > 0
            ORDER BY rank DESC, length(name) ASC, price_usd ASC
            LIMIT 20
        """), params).mappings().all()

        by_platform: dict = {}
        for row in rows:
            p = row["platform"]
            if p not in by_platform:
                by_platform[p] = dict(row)  # cheapest per platform (already sorted)

        basket[item_name] = by_platform

    # Build platform totals
    all_platforms = set()
    for matches in basket.values():
        all_platforms.update(matches.keys())

    platform_totals = {}
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
        platform_totals[platform] = round(total, 2)
        platform_items[platform] = {
            "total": round(total, 2),
            "found": found_items,
            "missing": missing_items,
            "coverage": len(found_items),
        }

    # Best mix: cheapest source for each item
    best_mix_total = 0.0
    best_mix_items = []
    for item_name, matches in basket.items():
        if not matches:
            best_mix_items.append({
                "searched": item_name,
                "found": None,
                "platform": None,
                "price_usd": None,
            })
            continue
        # Pick cheapest across all platforms
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
