import { useState, useCallback, useEffect } from "react";
import {
  View, Text, TextInput, FlatList, Image, StyleSheet,
  ActivityIndicator, TouchableOpacity, SafeAreaView,
  Modal, ScrollView, Platform, Linking,
} from "react-native";
import { searchDishes, Dish } from "../services/api";

const POPULAR = [
  { label: "🥙 Shawarma", q: "shawarma" },
  { label: "🍔 Burger", q: "burger" },
  { label: "🍕 Pizza", q: "pizza" },
  { label: "🥗 Salad", q: "salad" },
  { label: "🍣 Sushi", q: "sushi" },
  { label: "🍝 Pasta", q: "pasta" },
  { label: "🥩 Steak", q: "steak" },
  { label: "🌮 Tacos", q: "tacos" },
];

const CUISINES = [
  { label: "🇱🇧 Lebanese", q: "Lebanese" },
  { label: "🍔 American", q: "American" },
  { label: "🇮🇹 Italian", q: "Italian" },
  { label: "🇯🇵 Japanese", q: "Japanese" },
  { label: "🇮🇳 Indian", q: "Indian" },
  { label: "🇲🇽 Mexican", q: "Mexican" },
];

export default function HomeScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLon, setUserLon] = useState<number | undefined>();
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { setUserLat(pos.coords.latitude); setUserLon(pos.coords.longitude); },
        () => {}
      );
    }
  }, []);

  const doSearch = useCallback(async (q: string, cuisine?: string) => {
    setQuery(q);
    setLoading(true);
    setSearched(true);
    try {
      const dishes = await searchDishes(q.trim(), userLat, userLon, cuisine);
      setResults(dishes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userLat, userLon]);

  const handleSearch = useCallback(() => doSearch(query), [query, doSearch]);

  const openUrl = (url: string) => {
    if (typeof window !== "undefined") window.location.href = url;
    else Linking.openURL(url);
  };

  const openDirections = (dish: Dish) => {
    if (!dish.restaurant_lat || !dish.restaurant_lon) return;
    const name = encodeURIComponent(dish.restaurant_name + " Lebanon");
    openUrl(`https://maps.google.com/maps/search/${name}/@${dish.restaurant_lat},${dish.restaurant_lon},17z`);
  };

  const openGoogleSearch = (dish: Dish) => {
    openUrl(`https://www.google.com/search?q=${encodeURIComponent(dish.restaurant_name + " Lebanon")}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>menuze</Text>
          <Text style={styles.tagline}>
            {userLat ? "📍 Sorted by distance from you" : "Compare dish prices across Beirut"}
          </Text>
        </View>

        {/* Search bar */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            placeholder="Search a dish..."
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

        {/* Loading */}
        {loading && <ActivityIndicator size="large" color="#FF4D00" style={{ marginTop: 40 }} />}

        {/* Results */}
        {!loading && searched && results.length === 0 && (
          <>
            <TouchableOpacity style={styles.backBtn} onPress={() => { setSearched(false); setQuery(""); setResults([]); }}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.empty}>No dishes found. Try another search.</Text>
          </>
        )}

        {!loading && results.length > 0 && (
          <>
            <TouchableOpacity style={styles.backBtn} onPress={() => { setSearched(false); setQuery(""); setResults([]); }}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.sectionLabel}>{results.length} results for "{query}"</Text>
            {results.map((item) => (
              <DishCard key={item.id} dish={item} onPress={() => setSelectedDish(item)} />
            ))}
          </>
        )}

        {/* Empty state — show popular searches */}
        {!searched && (
          <>
            <Text style={styles.sectionLabel}>Popular searches</Text>
            <View style={styles.chipsWrap}>
              {POPULAR.map((p) => (
                <TouchableOpacity key={p.q} style={styles.chip} onPress={() => doSearch(p.q)}>
                  <Text style={styles.chipText}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Browse by cuisine</Text>
            <View style={styles.chipsWrap}>
              {CUISINES.map((c) => (
                <TouchableOpacity key={c.q} style={styles.chipOutline} onPress={() => doSearch("", c.q)}>
                  <Text style={styles.chipOutlineText}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>🔥 Find the best price</Text>
              <Text style={styles.bannerSub}>Search any dish and compare prices across 760+ restaurants in Beirut</Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Restaurant detail modal */}
      <Modal visible={!!selectedDish} animationType="slide" transparent onRequestClose={() => setSelectedDish(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedDish(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            {selectedDish && (
              <ScrollView>
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
                      <Text style={styles.sheetPriceLbp}>{Math.round(selectedDish.price_lbp / 1000)}k LBP</Text>
                    )}
                  </View>
                  <View style={styles.sheetRestaurantRow}>
                    {selectedDish.logo_url ? (
                      <Image source={{ uri: selectedDish.logo_url }} style={styles.sheetLogo} />
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sheetRestaurantName}>{selectedDish.restaurant_name}</Text>
                      {selectedDish.cuisine ? (
                        <Text style={styles.sheetCuisine}>{selectedDish.cuisine}</Text>
                      ) : null}
                    </View>
                  </View>
                  {selectedDish.distance_km != null && (
                    <Text style={styles.sheetDistance}>📍 {selectedDish.distance_km} km away</Text>
                  )}
                  <View style={styles.sheetActions}>
                    {selectedDish.restaurant_lat && selectedDish.restaurant_lon ? (
                      <TouchableOpacity style={styles.btnDirections} onPress={() => openDirections(selectedDish)}>
                        <Text style={styles.btnDirectionsText}>🗺 Get Directions</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity style={styles.btnGoogle} onPress={() => openGoogleSearch(selectedDish)}>
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
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {dish.image_url ? (
        <Image source={{ uri: dish.image_url }} style={styles.dishImage} />
      ) : (
        <View style={[styles.dishImage, styles.imagePlaceholder]} />
      )}
      <View style={styles.cardBody}>
        <Text style={styles.dishName} numberOfLines={1}>{dish.dish_name}</Text>
        <View style={styles.restaurantRow}>
          {dish.logo_url ? (
            <Image source={{ uri: dish.logo_url }} style={styles.logo_img} />
          ) : null}
          <Text style={styles.restaurantName} numberOfLines={1}>{dish.restaurant_name}</Text>
        </View>
        {dish.description ? (
          <Text style={styles.description} numberOfLines={2}>{dish.description}</Text>
        ) : null}
        {dish.distance_km != null && (
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
  container: { flex: 1, backgroundColor: "#F8F8F6" },

  // Header
  header: { alignItems: "center", paddingTop: 32, paddingBottom: 20 },
  logo: { fontSize: 38, fontWeight: "800", color: "#FF4D00", letterSpacing: -1 },
  tagline: { fontSize: 13, color: "#888", marginTop: 4 },

  // Search
  searchRow: { flexDirection: "row", gap: 8, marginHorizontal: 16, marginBottom: 20 },
  input: {
    flex: 1, backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#E8E8E8",
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, color: "#111", shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  searchBtn: {
    backgroundColor: "#FF4D00", borderRadius: 14,
    paddingHorizontal: 22, justifyContent: "center",
    shadowColor: "#FF4D00", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  searchBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  // Section
  sectionLabel: {
    fontSize: 13, fontWeight: "700", color: "#888", textTransform: "uppercase",
    letterSpacing: 0.5, marginHorizontal: 16, marginBottom: 10, marginTop: 4,
  },

  // Chips
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, marginBottom: 20, gap: 8 },
  chip: {
    backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: "#EDEDED",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  chipText: { fontSize: 14, color: "#222", fontWeight: "600" },
  chipOutline: {
    backgroundColor: "#FFF5F2", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1.5, borderColor: "#FFD4C2",
  },
  chipOutlineText: { fontSize: 14, color: "#FF4D00", fontWeight: "600" },

  // Banner
  banner: {
    margin: 16, marginTop: 4, padding: 20, backgroundColor: "#FF4D00",
    borderRadius: 18,
    shadowColor: "#FF4D00", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  bannerTitle: { fontSize: 18, fontWeight: "800", color: "#fff", marginBottom: 6 },
  bannerSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 18 },

  // Back button
  backBtn: { paddingHorizontal: 16, paddingVertical: 8, marginBottom: 4 },
  backBtnText: { fontSize: 15, color: "#FF4D00", fontWeight: "700" },

  // Results
  empty: { textAlign: "center", color: "#aaa", marginTop: 60, fontSize: 15 },

  // Card
  card: {
    flexDirection: "row", backgroundColor: "#fff",
    borderRadius: 16, marginBottom: 10, marginHorizontal: 16,
    overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  dishImage: { width: 90, height: 90 },
  imagePlaceholder: { backgroundColor: "#F0F0F0" },
  cardBody: { flex: 1, padding: 10, justifyContent: "center" },
  dishName: { fontSize: 14, fontWeight: "700", color: "#111", marginBottom: 3 },
  restaurantRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 3 },
  logo_img: { width: 16, height: 16, borderRadius: 3 },
  restaurantName: { fontSize: 11, color: "#888", flex: 1 },
  description: { fontSize: 11, color: "#BBB", lineHeight: 15 },
  distance: { fontSize: 11, color: "#FF4D00", marginTop: 3, fontWeight: "600" },
  priceBox: { justifyContent: "center", alignItems: "flex-end", paddingHorizontal: 10, minWidth: 70 },
  price: { fontSize: 15, fontWeight: "800", color: "#FF4D00" },
  priceLbp: { fontSize: 10, color: "#AAA", marginTop: 2 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", overflow: "hidden" },
  sheetDishImg: { width: "100%", height: 200 },
  sheetBody: { padding: 20 },
  sheetDishName: { fontSize: 20, fontWeight: "800", color: "#111", marginBottom: 6 },
  sheetDesc: { fontSize: 13, color: "#888", marginBottom: 14, lineHeight: 19 },
  sheetPriceRow: { flexDirection: "row", gap: 12, alignItems: "baseline", marginBottom: 16 },
  sheetPriceUsd: { fontSize: 26, fontWeight: "800", color: "#FF4D00" },
  sheetPriceLbp: { fontSize: 14, color: "#AAA" },
  sheetRestaurantRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#F5F5F5",
  },
  sheetLogo: { width: 44, height: 44, borderRadius: 10 },
  sheetRestaurantName: { fontSize: 15, fontWeight: "700", color: "#111" },
  sheetCuisine: { fontSize: 12, color: "#AAA", marginTop: 2 },
  sheetDistance: { fontSize: 13, color: "#FF4D00", fontWeight: "600", marginBottom: 16 },
  sheetActions: { gap: 10, marginTop: 8, paddingBottom: 10 },
  btnDirections: { backgroundColor: "#FF4D00", borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  btnDirectionsText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnGoogle: { backgroundColor: "#F5F5F5", borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  btnGoogleText: { color: "#333", fontWeight: "600", fontSize: 15 },
});
