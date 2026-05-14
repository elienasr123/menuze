import { useState, useCallback } from "react";
import {
  View, Text, TextInput, FlatList, Image,
  StyleSheet, ActivityIndicator, TouchableOpacity, SafeAreaView,
} from "react-native";
import { searchDishes, Dish } from "../services/api";

export default function HomeScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const dishes = await searchDishes(query.trim());
      setResults(dishes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.logo}>menuze</Text>
      <Text style={styles.tagline}>Compare dish prices across Beirut</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search a dish... (e.g. steak, shawarma)"
          placeholderTextColor="#999"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchBtnText}>Go</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator size="large" color="#FF4D00" style={{ marginTop: 40 }} />}

      {!loading && searched && results.length === 0 && (
        <Text style={styles.empty}>No dishes found. Try another search.</Text>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => <DishCard dish={item} />}
      />
    </SafeAreaView>
  );
}

function DishCard({ dish }: { dish: Dish }) {
  return (
    <View style={styles.card}>
      {dish.image_url ? (
        <Image source={{ uri: dish.image_url }} style={styles.dishImage} />
      ) : (
        <View style={[styles.dishImage, styles.imagePlaceholder]} />
      )}
      <View style={styles.cardBody}>
        <Text style={styles.dishName}>{dish.dish_name}</Text>
        <View style={styles.restaurantRow}>
          {dish.logo_url ? (
            <Image source={{ uri: dish.logo_url }} style={styles.logo_img} />
          ) : null}
          <Text style={styles.restaurantName}>{dish.restaurant_name}</Text>
        </View>
        {dish.description ? (
          <Text style={styles.description} numberOfLines={2}>{dish.description}</Text>
        ) : null}
      </View>
      <View style={styles.priceBox}>
        {dish.price_usd > 0 && (
          <Text style={styles.price}>${dish.price_usd.toFixed(2)}</Text>
        )}
        {dish.price_lbp > 0 && (
          <Text style={styles.priceLbp}>{Math.round(dish.price_lbp / 1000)}k LBP</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingHorizontal: 16 },
  logo: { fontSize: 32, fontWeight: "800", color: "#FF4D00", marginTop: 24, textAlign: "center" },
  tagline: { fontSize: 13, color: "#888", textAlign: "center", marginBottom: 20 },
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  input: {
    flex: 1, borderWidth: 1.5, borderColor: "#E0E0E0", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: "#111",
  },
  searchBtn: {
    backgroundColor: "#FF4D00", borderRadius: 12,
    paddingHorizontal: 20, justifyContent: "center",
  },
  searchBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  empty: { textAlign: "center", color: "#aaa", marginTop: 60, fontSize: 15 },
  card: {
    flexDirection: "row", borderWidth: 1, borderColor: "#F0F0F0",
    borderRadius: 14, marginBottom: 12, overflow: "hidden", backgroundColor: "#FAFAFA",
  },
  dishImage: { width: 90, height: 90 },
  imagePlaceholder: { backgroundColor: "#EEE" },
  cardBody: { flex: 1, padding: 10, justifyContent: "center" },
  dishName: { fontSize: 15, fontWeight: "700", color: "#111", marginBottom: 4 },
  restaurantRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  logo_img: { width: 18, height: 18, borderRadius: 4 },
  restaurantName: { fontSize: 12, color: "#666" },
  description: { fontSize: 11, color: "#999" },
  priceBox: { justifyContent: "center", alignItems: "flex-end", paddingHorizontal: 12 },
  price: { fontSize: 14, fontWeight: "800", color: "#FF4D00" },
  priceLbp: { fontSize: 11, color: "#888", marginTop: 2 },
});
