from sqlalchemy.orm import Session
from sqlalchemy import text


def search_dishes(
    db: Session,
    query: str,
    limit: int = 50,
    lat: float | None = None,
    lon: float | None = None,
    radius_km: float = 5.0,
) -> list[dict]:

    # Build location filter if coordinates provided
    if lat is not None and lon is not None:
        location_filter = """
            AND (
                r.lat IS NULL OR r.lon IS NULL OR
                (6371 * acos(
                    cos(radians(:lat)) * cos(radians(r.lat::float)) *
                    cos(radians(r.lon::float) - radians(:lon)) +
                    sin(radians(:lat)) * sin(radians(r.lat::float))
                )) <= :radius_km
            )
        """
        distance_col = """
            CASE WHEN r.lat IS NOT NULL AND r.lon IS NOT NULL THEN
                ROUND((6371 * acos(
                    cos(radians(:lat)) * cos(radians(r.lat::float)) *
                    cos(radians(r.lon::float) - radians(:lon)) +
                    sin(radians(:lat)) * sin(radians(r.lat::float))
                ))::numeric, 2)
            END AS distance_km,
        """
        params = {
            "query": query,
            "like_query": f"%{query}%",
            "limit": limit,
            "lat": lat,
            "lon": lon,
            "radius_km": radius_km,
        }
    else:
        location_filter = ""
        distance_col = "NULL AS distance_km,"
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
        WHERE (
            d.search_vector @@ plainto_tsquery('simple', :query)
            OR d.name ILIKE :like_query
        )
        {location_filter}
        ORDER BY rank DESC, d.name
        LIMIT :limit
    """), params).mappings().all()

    return [dict(row) for row in rows]
