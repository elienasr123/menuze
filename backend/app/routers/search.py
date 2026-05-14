from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.search import search_dishes
from typing import Optional  # noqa

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def search(
    q: str = Query(..., min_length=1),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    radius_km: float = Query(5.0),
    db: Session = Depends(get_db),
):
    results = search_dishes(db, q, lat=lat, lon=lon, radius_km=radius_km)
    return {"query": q, "results": results}
