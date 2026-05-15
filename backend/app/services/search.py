from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional


def search_dishes(
    db: Session,
    query: str,
    limit: int = 50,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    cuisine: Optional[str] = None,
    restaurant_id: Optional[str] = None,
    sort: str = "relevance",  # relevance | price_asc | price_desc | distance
) -> list[dict]:

    has_query = bool(query and query.strip())
    has_cuisine = bool(cuisine and cuisine.strip())
    has_restaurant = bool(restaurant_id)

    if not has_query and not has_cuisine and not has_restaurant:
        return []

    # Increase limit for restaurant page
    if has_restaurant and not has_query:
        limit = 200

    # Distance column
    if lat is not None and lon is not None:
        distance_col = """
            CASE WHEN r.lat IS NOT NULL AND r.lat != 0 AND r.lon IS NOT NULL AND r.lon != 0 THEN
                ROUND((6371 * acos(
                    LEAST(1.0, cos(radians(:lat)) * cos(radians(r.lat::float)) *
                    cos(radians(r.lon::float) - radians(:lon)) +
                    sin(radians(:lat)) * sin(radians(r.lat::float)))
                ))::numeric, 1)
            ELSE NULL END AS distance_km,
        """
        params: dict = {"limit": limit, "lat": lat, "lon": lon}
    else:
        distance_col = "NULL AS distance_km,"
        params = {"limit": limit}

    # Price expression helper
    price_expr = "CASE WHEN d.price_usd > 0 THEN d.price_usd ELSE d.price_lbp/89500.0 END"

    # Distance expression helper (for use in ORDER BY)
    if lat is not None and lon is not None:
        dist_expr = """CASE WHEN r.lat IS NOT NULL AND r.lat != 0 AND r.lon IS NOT NULL AND r.lon != 0 THEN
            6371 * acos(LEAST(1.0, cos(radians(:lat)) * cos(radians(r.lat::float)) *
            cos(radians(r.lon::float) - radians(:lon)) + sin(radians(:lat)) * sin(radians(r.lat::float))))
            ELSE 10 END"""
    else:
        dist_expr = "10"

    # Sort order
    if sort == "price_asc":
        order_by = f"ORDER BY {price_expr} ASC NULLS LAST"
    elif sort == "price_desc":
        order_by = f"ORDER BY {price_expr} DESC NULLS LAST"
    elif sort == "distance" and lat is not None:
        order_by = "ORDER BY distance_km ASC NULLS LAST, rank DESC"
    elif sort == "value" and lat is not None:
        # Best value = cheapest price + nearest location combined score
        order_by = f"ORDER BY (COALESCE({price_expr}, 999) + ({dist_expr}) * 1.5) ASC NULLS LAST"
    else:
        if lat is not None and lon is not None:
            order_by = "ORDER BY distance_km ASC NULLS LAST, rank DESC, d.name"
        else:
            order_by = "ORDER BY rank DESC, d.name"

    # Text search filter
    if has_query:
        q = query.strip()
        text_filter = """(
            d.search_vector @@ plainto_tsquery('simple', :query)
            OR d.name ILIKE :like_query
            OR d.name ILIKE :start_query
        )"""
        rank_col = "ts_rank(d.search_vector, plainto_tsquery('simple', :query)) AS rank,"
        params["query"] = q
        params["like_query"] = f"%{q}%"
        params["start_query"] = f"{q}%"
    else:
        text_filter = "1=1"
        rank_col = "0 AS rank,"

    # Cuisine filter
    cuisine_filter = ""
    if has_cuisine:
        cuisine_filter += " AND r.cuisine ILIKE :cuisine"
        params["cuisine"] = f"%{cuisine}%"

    # Restaurant filter
    if has_restaurant:
        cuisine_filter += " AND r.id = :restaurant_id"
        params["restaurant_id"] = restaurant_id

    rows = db.execute(text(f"""
        SELECT
            d.id,
            d.name AS dish_name,
            d.price_lbp,
            d.price_usd,
            d.currency,
            d.description,
            d.image_url,
            d.category,
            r.id AS restaurant_id,
            r.name AS restaurant_name,
            r.logo_url,
            r.cuisine,
            r.lat AS restaurant_lat,
            r.lon AS restaurant_lon,
            {distance_col}
            {rank_col}
            1 AS _dummy
        FROM dishes d
        JOIN restaurants r ON r.id = d.restaurant_id
        WHERE {text_filter}
        AND (d.price_usd > 0 OR d.price_lbp >= 1000)
        {cuisine_filter}
        {order_by}
        LIMIT :limit
    """), params).mappings().all()

    results = []
    for row in rows:
        r = dict(row)
        r.pop("_dummy", None)
        for key in ("restaurant_lat", "restaurant_lon", "distance_km",
                    "price_lbp", "price_usd", "rank"):
            if r.get(key) is not None:
                r[key] = float(r[key])
        results.append(r)
    return results
