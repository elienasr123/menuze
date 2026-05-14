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
}

export async function searchDishes(query: string): Promise<Dish[]> {
  const { data } = await api.get("/search", { params: { q: query } });
  return data.results;
}
