from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.dish import Restaurant

router = APIRouter(prefix="/restaurants", tags=["restaurants"])


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
