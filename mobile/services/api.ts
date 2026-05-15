import axios from "axios";

const BASE_URL = "https://menuze-production.up.railway.app";

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "x-api-key": "ad5e09f11e3f8a1003282286ba6960763805974613609181ced479647684125f",
  },
});

export interface Dish {
  id: number;
  dish_name: string;
  price_lbp: number;
  price_usd: number;
  prev_price_usd: number | null;
  prev_price_lbp: number | null;
  currency: string;
  description: string;
  image_url: string;
  category: string;
  restaurant_id: string;
  restaurant_name: string;
  logo_url: string;
  cuisine: string;
  restaurant_lat: number | null;
  restaurant_lon: number | null;
  distance_km: number | null;
}

export interface Restaurant {
  id: string;
  name: string;
  logo_url: string;
  cuisine: string;
  lat: number | null;
  lon: number | null;
  dish_count: number;
}

export interface TrendingDish {
  id: number;
  dish_name: string;
  price_usd: number;
  price_lbp: number;
  prev_price_usd: number | null;
  prev_price_lbp: number | null;
  change_pct: number;
  restaurant_id: string;
  restaurant_name: string;
  logo_url: string;
  cuisine: string;
}

export async function searchRestaurants(query: string): Promise<Restaurant[]> {
  const { data } = await api.get("/restaurants/search", { params: { q: query } });
  return data.results;
}

export async function searchDishes(
  query: string,
  lat?: number,
  lon?: number,
  cuisine?: string,
  restaurantId?: string,
  sort: string = "relevance"
): Promise<Dish[]> {
  const params: Record<string, string | number> = { q: query, sort };
  if (lat !== undefined && lon !== undefined) {
    params.lat = lat;
    params.lon = lon;
  }
  if (cuisine) params.cuisine = cuisine;
  if (restaurantId) params.restaurant_id = restaurantId;
  const { data } = await api.get("/search", { params });
  return data.results;
}

export async function getTrending(): Promise<{ up: TrendingDish[]; down: TrendingDish[] }> {
  const { data } = await api.get("/trending");
  return data;
}
