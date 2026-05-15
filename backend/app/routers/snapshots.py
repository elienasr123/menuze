from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from datetime import datetime, timezone

router = APIRouter(tags=["snapshots"])


@router.get("/snapshot")
def take_snapshot(db: Session = Depends(get_db)):
    """
    Record current prices. Call this daily via cron.
    Inserts a new row into price_snapshots only when price changes.
    Also updates prev_price_* on the dish row.
    """
    rows = db.execute(text("""
        SELECT d.id, d.price_usd, d.price_lbp,
               s.price_usd AS snap_usd, s.price_lbp AS snap_lbp
        FROM dishes d
        LEFT JOIN LATERAL (
            SELECT price_usd, price_lbp FROM price_snapshots
            WHERE dish_id = d.id ORDER BY recorded_at DESC LIMIT 1
        ) s ON true
        WHERE d.price_usd > 0 OR d.price_lbp >= 1000
    """)).mappings().all()

    inserted = 0
    now = datetime.now(timezone.utc)

    for row in rows:
        cur_usd = float(row["price_usd"] or 0)
        cur_lbp = float(row["price_lbp"] or 0)
        snap_usd = float(row["snap_usd"] or -1)
        snap_lbp = float(row["snap_lbp"] or -1)

        price_changed = (snap_usd < 0) or (abs(cur_usd - snap_usd) > 0.01) or (abs(cur_lbp - snap_lbp) > 100)

        if price_changed:
            # Store snapshot
            db.execute(text("""
                INSERT INTO price_snapshots (dish_id, price_usd, price_lbp, recorded_at)
                VALUES (:dish_id, :usd, :lbp, :now)
            """), {"dish_id": row["id"], "usd": cur_usd, "lbp": cur_lbp, "now": now})

            # Update prev_ columns on dish if price actually changed (not first snapshot)
            if snap_usd >= 0:
                db.execute(text("""
                    UPDATE dishes SET
                        prev_price_usd = :prev_usd,
                        prev_price_lbp = :prev_lbp,
                        price_updated_at = :now
                    WHERE id = :dish_id
                """), {
                    "prev_usd": snap_usd, "prev_lbp": snap_lbp,
                    "now": now, "dish_id": row["id"],
                })

            inserted += 1

    db.commit()
    return {"snapshots_recorded": inserted, "total_dishes": len(rows)}


@router.get("/trending")
def get_trending(db: Session = Depends(get_db)):
    """
    Return dishes with biggest price changes recently (for the Price Index section).
    """
    rows = db.execute(text("""
        SELECT
            d.id, d.name AS dish_name, d.price_usd, d.price_lbp,
            d.prev_price_usd, d.prev_price_lbp, d.price_updated_at,
            r.id AS restaurant_id, r.name AS restaurant_name,
            r.logo_url, r.cuisine
        FROM dishes d
        JOIN restaurants r ON r.id = d.restaurant_id
        WHERE d.prev_price_usd IS NOT NULL
          AND d.price_updated_at IS NOT NULL
          AND (d.price_usd > 0 OR d.price_lbp >= 1000)
        ORDER BY d.price_updated_at DESC
        LIMIT 40
    """)).mappings().all()

    up, down = [], []
    for row in rows:
        d = dict(row)
        cur = float(d["price_usd"] or 0) or float(d["price_lbp"] or 0) / 89500
        prev = float(d["prev_price_usd"] or 0) or float(d["prev_price_lbp"] or 0) / 89500
        if cur <= 0 or prev <= 0:
            continue
        pct = round((cur - prev) / prev * 100, 1)
        d["change_pct"] = pct
        for k in ("price_usd", "price_lbp", "prev_price_usd", "prev_price_lbp"):
            if d.get(k) is not None:
                d[k] = float(d[k])
        d["price_updated_at"] = d["price_updated_at"].isoformat() if d.get("price_updated_at") else None
        if pct > 0:
            up.append(d)
        else:
            down.append(d)

    # Sort: biggest change first, cap at 10 each
    up.sort(key=lambda x: x["change_pct"], reverse=True)
    down.sort(key=lambda x: x["change_pct"])
    return {"up": up[:10], "down": down[:10]}
