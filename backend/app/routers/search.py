from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.search import search_dishes
from typing import Optional

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def search(
    q: str = Query(""),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    cuisine: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    results = search_dishes(db, q, lat=lat, lon=lon, cuisine=cuisine)
    return {"query": q, "results": results}
