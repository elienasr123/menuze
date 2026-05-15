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
) -> list[dict]:

    has_query = bool(query and query.strip())
    has_cuisine = bool(cuisine and cuisine.strip())

    if not has_query and not has_cuisine:
        return []

    # Distance column
    if lat is not None and lon is not None:
        distance_col = """
            ROUND((6371 * acos(
                LEAST(1.0, cos(radians(:lat)) * cos(radians(r.lat::float)) *
                cos(radians(r.lon::float) - radians(:lon)) +
                sin(radians(:lat)) * sin(radians(r.lat::float)))
            ))::numeric, 1) AS distance_km,
        """
        order_by = "ORDER BY distance_km ASC NULLS LAST, rank DESC, d.name"
        params: dict = {"limit": limit, "lat": lat, "lon": lon}
    else:
        distance_col = "NULL AS distance_km,"
        order_by = "ORDER BY rank DESC, d.name"
        params = {"limit": limit}

    # Text search filter
    if has_query:
        text_filter = """(
            d.search_vector @@ plainto_tsquery('simple', :query)
            OR d.name ILIKE :like_query
        )"""
        rank_col = "ts_rank(d.search_vector, plainto_tsquery('simple', :query)) AS rank,"
        params["query"] = query.strip()
        params["like_query"] = f"%{query.strip()}%"
    else:
        text_filter = "1=1"
        rank_col = "0 AS rank,"

    # Cuisine filter
    if has_cuisine:
        cuisine_filter = "AND r.cuisine ILIKE :cuisine"
        params["cuisine"] = f"%{cuisine}%"
    else:
        cuisine_filter = ""

    # Restaurant filter
    if restaurant_id:
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
