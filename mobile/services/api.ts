import axios from "axios";

const BASE_URL = "https://menuze-production.up.railway.app";

const api = axios.create({ baseURL: BASE_URL });

export interface Dish {
  id: number;
  dish_name: string;
  price_lbp: number;
  price_usd: number;
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

export async function searchDishes(
  query: string,
  lat?: number,
  lon?: number,
  cuisine?: string,
  restaurantId?: string
): Promise<Dish[]> {
  const params: Record<string, string | number> = { q: query };
  if (lat !== undefined && lon !== undefined) {
    params.lat = lat;
    params.lon = lon;
  }
  if (cuisine) params.cuisine = cuisine;
  if (restaurantId) params.restaurant_id = restaurantId;
  const { data } = await api.get("/search", { params });
  return data.results;
}
