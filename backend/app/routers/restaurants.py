from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.models.dish import Restaurant
from app.limiter import limiter
from typing import Optional

router = APIRouter(prefix="/restaurants", tags=["restaurants"])


@router.get("/search")
@limiter.limit("30/minute")
def search_restaurants(
    request: Request,
    q: str = Query(""),
    db: Session = Depends(get_db),
):
    if not q or not q.strip():
        return {"results": []}

    rows = db.execute(text("""
        SELECT
            r.id,
            r.name,
            r.logo_url,
            r.cuisine,
            r.lat,
            r.lon,
            COUNT(d.id) AS dish_count
        FROM restaurants r
        LEFT JOIN dishes d ON d.restaurant_id = r.id
            AND (d.price_usd > 0 OR d.price_lbp >= 1000)
        WHERE r.name ILIKE :q
        GROUP BY r.id
        ORDER BY
            CASE WHEN r.name ILIKE :exact THEN 0 ELSE 1 END,
            r.name
        LIMIT 5
    """), {"q": f"%{q.strip()}%", "exact": q.strip()}).mappings().all()

    results = []
    for row in rows:
        r = dict(row)
        r["dish_count"] = int(r["dish_count"] or 0)
        if r.get("lat") is not None:
            r["lat"] = float(r["lat"])
        if r.get("lon") is not None:
            r["lon"] = float(r["lon"])
        results.append(r)

    return {"results": results}


@router.get("")
def list_restaurants(db: Session = Depends(get_db)):
    restaurants = db.query(Restaurant).order_by(Restaurant.name).all()
    return [{"id": r.id, "name": r.name, "logo_url": r.logo_url, "cuisine": r.cuisine} for r in restaurants]


@router.get("/{restaurant_id}/dishes")
def get_restaurant_dishes(restaurant_id: str, db: Session = Depends(get_db)):
    restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return {
        "restaurant": {"id": restaurant.id, "name": restaurant.name, "logo_url": restaurant.logo_url},
        "dishes": [
            {
                "id": d.id,
                "name": d.name,
                "price_lbp": float(d.price_lbp or 0),
                "price_usd": float(d.price_usd or 0),
                "currency": d.currency,
                "description": d.description,
                "image_url": d.image_url,
                "category": d.category,
            }
            for d in restaurant.dishes
        ],
    }
