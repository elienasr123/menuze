from sqlalchemy.orm import Session
from sqlalchemy import text


def search_dishes(
    db: Session,
    query: str,
    limit: int = 50,
    lat: float | None = None,
    lon: float | None = None,
) -> list[dict]:

    if lat is not None and lon is not None:
        distance_col = """
            ROUND((6371 * acos(
                LEAST(1.0, cos(radians(:lat)) * cos(radians(r.lat::float)) *
                cos(radians(r.lon::float) - radians(:lon)) +
                sin(radians(:lat)) * sin(radians(r.lat::float)))
            ))::numeric, 1) AS distance_km,
        """
        order_by = "ORDER BY distance_km ASC NULLS LAST, rank DESC, d.name"
        params = {
            "query": query,
            "like_query": f"%{query}%",
            "limit": limit,
            "lat": lat,
            "lon": lon,
        }
    else:
        distance_col = "NULL AS distance_km,"
        order_by = "ORDER BY rank DESC, d.name"
        params = {
            "query": query,
            "like_query": f"%{query}%",
            "limit": limit,
        }

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
            ts_rank(d.search_vector, plainto_tsquery('simple', :query)) AS rank
        FROM dishes d
        JOIN restaurants r ON r.id = d.restaurant_id
        WHERE
            d.search_vector @@ plainto_tsquery('simple', :query)
            OR d.name ILIKE :like_query
        {order_by}
        LIMIT :limit
    """), params).mappings().all()

    return [dict(row) for row in rows]
