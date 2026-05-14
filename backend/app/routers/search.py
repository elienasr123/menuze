from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.search import search_dishes

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def search(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    results = search_dishes(db, q)
    return {"query": q, "results": results}
