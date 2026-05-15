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
  { label: "🇱🇧 Lebanese", q: "Lebanese", cuisine: "Lebanese" },
  { label: "🍔 Burgers", q: "burger", cuisine: "Burgers" },
  { label: "🍕 Pizza", q: "pizza", cuisine: "Pizza" },
  { label: "🇮🇹 Italian", q: "pasta pizza", cuisine: "Italian" },
  { label: "🍣 Sushi", q: "sushi", cuisine: "Sushi" },
  { label: "🥗 Healthy", q: "healthy salad", cuisine: "Healthy" },
  { label: "🌮 Mexican", q: "mexican tacos", cuisine: "Mexican" },
  { label: "🍗 Chicken", q: "chicken", cuisine: "Chicken" },
  { label: "🔥 Grills", q: "grill", cuisine: "Grills" },
  { label: "🫐 Desserts", q: "dessert cake", cuisine: "Desserts" },
  { label: "☕ Coffee", q: "coffee", cuisine: "Coffee" },
  { label: "🐟 Seafood", q: "seafood fish", cuisine: "Seafood" },
];

export default function HomeScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLon, setUserLon] = useState<number | undefined>();
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [showA2HS, setShowA2HS] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("recent_searches");
      if (saved) setRecentSearches(JSON.parse(saved));
    }
  }, []);

  const saveRecent = (q: string) => {
    if (!q.trim()) return;
    const updated = [q, ...recentSearches.filter(r => r !== q)].slice(0, 5);
    setRecentSearches(updated);
    if (typeof localStorage !== "undefined") localStorage.setItem("recent_searches", JSON.stringify(updated));
  };

  useEffect(() => {
    // Show "Add to Home Screen" banner on iOS Safari if not already installed
    if (typeof window !== "undefined") {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const isStandalone = (window.navigator as any).standalone === true;
      const dismissed = localStorage.getItem("a2hs_dismissed");
      if (isIOS && !isStandalone && !dismissed) setShowA2HS(true);
    }
  }, []);

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
    if (q.trim()) saveRecent(q.trim());
    try {
      const dishes = await searchDishes(q.trim(), userLat, userLon, cuisine);
      setResults(dishes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userLat, userLon, recentSearches]);

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
        {/* Add to Home Screen banner */}
        {showA2HS && (
          <View style={styles.a2hsBanner}>
            <Text style={styles.a2hsText}>📲 Add to Home Screen — tap <Text style={{fontWeight:"800"}}>Share</Text> then <Text style={{fontWeight:"800"}}>Add to Home Screen</Text></Text>
            <TouchableOpacity onPress={() => { setShowA2HS(false); if (typeof localStorage !== "undefined") localStorage.setItem("a2hs_dismissed", "1"); }}>
              <Text style={styles.a2hsClose}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

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
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsCount}>
                <Text style={styles.resultsCountBold}>{results.length}</Text> results for "<Text style={styles.resultsCountBold}>{query}</Text>"
              </Text>
              {userLat ? <Text style={styles.resultsSorted}>📍 sorted by distance</Text> : null}
            </View>
            {(() => {
              const withPrice = results.filter(d => d.price_usd > 0);
              const minPrice = withPrice.length ? Math.min(...withPrice.map(d => d.price_usd)) : null;
              const bestId = minPrice !== null ? withPrice.find(d => d.price_usd === minPrice)?.id : null;
              return results.map((item) => (
                <DishCard key={item.id} dish={item} onPress={() => setSelectedDish(item)} isBestPrice={item.id === bestId} />
              ));
            })()}
          </>
        )}

        {/* Empty state — show popular searches */}
        {!searched && (
          <>
            {recentSearches.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Recent searches</Text>
                <View style={styles.chipsWrap}>
                  {recentSearches.map((r) => (
                    <TouchableOpacity key={r} style={styles.chip} onPress={() => doSearch(r)}>
                      <Text style={styles.chipText}>🕐 {r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

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
                <TouchableOpacity key={c.q} style={styles.chipOutline} onPress={() => doSearch(c.q, c.cuisine)}>
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

function DishCard({ dish, onPress, isBestPrice }: { dish: Dish; onPress: () => void; isBestPrice?: boolean }) {
  const shareOnWhatsApp = (e: any) => {
    e.stopPropagation();
    const price = dish.price_usd > 0 ? `$${dish.price_usd.toFixed(2)}` : `${Math.round(dish.price_lbp / 1000)}k LBP`;
    const text = encodeURIComponent(`🍽 ${dish.dish_name} at ${dish.restaurant_name} for ${price}\nFind more deals on menuze 👉 https://elienasr123.github.io/menuze/`);
    if (typeof window !== "undefined") window.location.href = `https://wa.me/?text=${text}`;
  };

  return (
    <TouchableOpacity style={[styles.card, isBestPrice && styles.cardBest]} onPress={onPress} activeOpacity={0.85}>
      {isBestPrice && (
        <View style={styles.bestBadge}>
          <Text style={styles.bestBadgeText}>💰 Best Price</Text>
        </View>
      )}
      {dish.image_url ? (
        <Image source={{ uri: dish.image_url }} style={styles.dishImage} />
      ) : (
        <View style={[styles.dishImage, styles.imagePlaceholder]}>
          <Text style={{ fontSize: 28 }}>🍽</Text>
        </View>
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
          <Text style={styles.description} numberOfLines={1}>{dish.description}</Text>
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
        <TouchableOpacity onPress={shareOnWhatsApp} style={styles.shareBtn}>
          <Text style={styles.shareBtnText}>↗</Text>
        </TouchableOpacity>
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
  backBtn: { paddingHorizontal: 16, paddingVertical: 8, marginBottom: 0 },
  backBtnText: { fontSize: 15, color: "#FF4D00", fontWeight: "700" },

  // A2HS banner
  a2hsBanner: { backgroundColor: "#FFF5F2", borderBottomWidth: 1, borderBottomColor: "#FFD4C2", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  a2hsText: { fontSize: 12, color: "#FF4D00", flex: 1, lineHeight: 17 },
  a2hsClose: { fontSize: 16, color: "#FF4D00", paddingLeft: 12 },

  // Results header
  resultsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  resultsCount: { fontSize: 13, color: "#888" },
  resultsCountBold: { fontWeight: "700", color: "#111" },
  resultsSorted: { fontSize: 11, color: "#FF4D00", fontWeight: "600" },

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
  cardBest: {
    borderWidth: 1.5, borderColor: "#FF4D00",
    shadowColor: "#FF4D00", shadowOpacity: 0.15, shadowRadius: 10,
  },
  bestBadge: {
    position: "absolute", top: 8, left: 8, zIndex: 10,
    backgroundColor: "#FF4D00", borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  bestBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  dishImage: { width: 90, height: 90 },
  imagePlaceholder: { backgroundColor: "#F5F5F5", width: 90, height: 90, alignItems: "center", justifyContent: "center" },
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
  shareBtn: { marginTop: 8, backgroundColor: "#F0F0F0", borderRadius: 8, width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  shareBtnText: { fontSize: 14, color: "#555", fontWeight: "700" },

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
