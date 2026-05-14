from sqlalchemy.orm import Session
from sqlalchemy import text


def search_dishes(db: Session, query: str, limit: int = 50) -> list[dict]:
    # Full-text search with trigram fallback for partial matches
    rows = db.execute(text("""
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
            ts_rank(d.search_vector, plainto_tsquery('simple', :query)) AS rank
        FROM dishes d
        JOIN restaurants r ON r.id = d.restaurant_id
        WHERE
            d.search_vector @@ plainto_tsquery('simple', :query)
            OR d.name ILIKE :like_query
        ORDER BY rank DESC, d.name
        LIMIT :limit
    """), {
        "query": query,
        "like_query": f"%{query}%",
        "limit": limit,
    }).mappings().all()

    return [dict(row) for row in rows]
