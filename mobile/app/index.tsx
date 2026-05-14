import { useState, useCallback, useEffect } from "react";
import {
  View, Text, TextInput, FlatList, Image, StyleSheet,
  ActivityIndicator, TouchableOpacity, SafeAreaView,
  Modal, Linking, Platform, ScrollView,
} from "react-native";
import { searchDishes, Dish } from "../services/api";

export default function HomeScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLon, setUserLon] = useState<number | undefined>();
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);

  // Silently try to get location — works if allowed, skipped if denied
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLat(pos.coords.latitude);
          setUserLon(pos.coords.longitude);
        },
        () => {}
      );
    }
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const dishes = await searchDishes(query.trim(), userLat, userLon);
      setResults(dishes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [query, userLat, userLon]);

  const openUrl = (url: string) => {
    if (typeof window !== "undefined") {
      window.location.href = url;
    } else {
      Linking.openURL(url);
    }
  };

  const openDirections = (dish: Dish) => {
    if (!dish.restaurant_lat || !dish.restaurant_lon) return;
    const name = encodeURIComponent(dish.restaurant_name + " Lebanon");
    openUrl(`https://maps.google.com/maps/search/${name}/@${dish.restaurant_lat},${dish.restaurant_lon},17z`);
  };

  const openGoogleSearch = (dish: Dish) => {
    const q = encodeURIComponent(`${dish.restaurant_name} Lebanon`);
    openUrl(`https://www.google.com/search?q=${q}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.logo}>menuze</Text>
      <Text style={styles.tagline}>
        {userLat ? "📍 Sorted by distance from you" : "Compare dish prices across Beirut"}
      </Text>

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
        renderItem={({ item }) => (
          <DishCard dish={item} onPress={() => setSelectedDish(item)} />
        )}
      />

      {/* Restaurant detail modal */}
      <Modal
        visible={!!selectedDish}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedDish(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedDish(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            {selectedDish && (
              <ScrollView>
                {/* Dish image */}
                {selectedDish.image_url ? (
                  <Image source={{ uri: selectedDish.image_url }} style={styles.sheetDishImg} />
                ) : (
                  <View style={[styles.sheetDishImg, { backgroundColor: "#EEE" }]} />
                )}

                <View style={styles.sheetBody}>
                  <Text style={styles.sheetDishName}>{selectedDish.dish_name}</Text>
                  {selectedDish.description ? (
                    <Text style={styles.sheetDesc}>{selectedDish.description}</Text>
                  ) : null}

                  <View style={styles.sheetPriceRow}>
                    {selectedDish.price_usd > 0 && (
                      <Text style={styles.sheetPriceUsd}>${selectedDish.price_usd.toFixed(2)}</Text>
                    )}
                    {selectedDish.price_lbp > 0 && (
                      <Text style={styles.sheetPriceLbp}>
                        {Math.round(selectedDish.price_lbp / 1000)}k LBP
                      </Text>
                    )}
                  </View>

                  {/* Restaurant info */}
                  <View style={styles.sheetRestaurantRow}>
                    {selectedDish.logo_url ? (
                      <Image source={{ uri: selectedDish.logo_url }} style={styles.sheetLogo} />
                    ) : null}
                    <View>
                      <Text style={styles.sheetRestaurantName}>{selectedDish.restaurant_name}</Text>
                      {selectedDish.cuisine ? (
                        <Text style={styles.sheetCuisine}>{selectedDish.cuisine}</Text>
                      ) : null}
                    </View>
                  </View>

                  {selectedDish.distance_km !== null && selectedDish.distance_km !== undefined && (
                    <Text style={styles.sheetDistance}>
                      📍 {selectedDish.distance_km} km away
                    </Text>
                  )}

                  {/* Action buttons */}
                  <View style={styles.sheetActions}>
                    {selectedDish.restaurant_lat && selectedDish.restaurant_lon ? (
                      <TouchableOpacity
                        style={styles.btnDirections}
                        onPress={() => openDirections(selectedDish)}
                      >
                        <Text style={styles.btnDirectionsText}>🗺 Get Directions</Text>
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                      style={styles.btnGoogle}
                      onPress={() => openGoogleSearch(selectedDish)}
                    >
                      <Text style={styles.btnGoogleText}>🔍 Search on Google</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function DishCard({ dish, onPress }: { dish: Dish; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
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
        {dish.distance_km !== null && dish.distance_km !== undefined && (
          <Text style={styles.distance}>📍 {dish.distance_km} km</Text>
        )}
      </View>
      <View style={styles.priceBox}>
        {dish.price_usd > 0 && (
          <Text style={styles.price}>${dish.price_usd.toFixed(2)}</Text>
        )}
        {dish.price_lbp > 0 && (
          <Text style={styles.priceLbp}>{Math.round(dish.price_lbp / 1000)}k LBP</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingHorizontal: 16 },
  logo: { fontSize: 32, fontWeight: "800", color: "#FF4D00", marginTop: 24, textAlign: "center" },
  tagline: { fontSize: 13, color: "#888", textAlign: "center", marginBottom: 20 },
  taglineLocation: { fontSize: 13, color: "#FF4D00", textAlign: "center", marginBottom: 20, textDecorationLine: "underline" },
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

  // Card
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
  distance: { fontSize: 11, color: "#FF4D00", marginTop: 2 },
  priceBox: { justifyContent: "center", alignItems: "flex-end", paddingHorizontal: 12 },
  price: { fontSize: 14, fontWeight: "800", color: "#FF4D00" },
  priceLbp: { fontSize: 11, color: "#888", marginTop: 2 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: "85%", overflow: "hidden",
  },
  sheetDishImg: { width: "100%", height: 200 },
  sheetBody: { padding: 20 },
  sheetDishName: { fontSize: 20, fontWeight: "800", color: "#111", marginBottom: 6 },
  sheetDesc: { fontSize: 13, color: "#777", marginBottom: 12, lineHeight: 18 },
  sheetPriceRow: { flexDirection: "row", gap: 12, alignItems: "baseline", marginBottom: 16 },
  sheetPriceUsd: { fontSize: 22, fontWeight: "800", color: "#FF4D00" },
  sheetPriceLbp: { fontSize: 14, color: "#888" },
  sheetRestaurantRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#F0F0F0",
  },
  sheetLogo: { width: 40, height: 40, borderRadius: 8 },
  sheetRestaurantName: { fontSize: 15, fontWeight: "700", color: "#111" },
  sheetCuisine: { fontSize: 12, color: "#999", marginTop: 2 },
  sheetDistance: { fontSize: 13, color: "#FF4D00", marginBottom: 16 },
  sheetActions: { gap: 10, marginTop: 8 },
  btnDirections: {
    backgroundColor: "#FF4D00", borderRadius: 12, paddingVertical: 14,
    alignItems: "center",
  },
  btnDirectionsText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnGoogle: {
    backgroundColor: "#F5F5F5", borderRadius: 12, paddingVertical: 14,
    alignItems: "center",
  },
  btnGoogleText: { color: "#333", fontWeight: "600", fontSize: 15 },
});
