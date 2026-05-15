from sqlalchemy import Column, Integer, Text, Numeric, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.database import Base


class Restaurant(Base):
    __tablename__ = "restaurants"

    id = Column(Text, primary_key=True)
    name = Column(Text, nullable=False)
    logo_url = Column(Text)
    cuisine = Column(Text)
    dishes = relationship("Dish", back_populates="restaurant")


class Dish(Base):
    __tablename__ = "dishes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    restaurant_id = Column(Text, ForeignKey("restaurants.id"))
    name = Column(Text, nullable=False)
    price_lbp = Column(Numeric, default=0)
    price_usd = Column(Numeric, default=0)
    currency = Column(Text, default="LBP")
    description = Column(Text)
    image_url = Column(Text)
    category = Column(Text)
    prev_price_usd = Column(Numeric, default=None)
    prev_price_lbp = Column(Numeric, default=None)
    price_updated_at = Column(DateTime(timezone=True), default=None)

    restaurant = relationship("Restaurant", back_populates="dishes")
