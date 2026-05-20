import { useState, useCallback } from "react";
import {
  View, Text, TextInput, FlatList, Image, StyleSheet,
  ActivityIndicator, TouchableOpacity, ScrollView, Modal,
} from "react-native";
import { searchRetailProducts, compareBasket, RetailProduct, BasketComparison } from "../services/api";

const PLATFORM_COLORS: Record<string, string> = {
  noknok: "#FF6B35",
  toters: "#1DB954",
};

const PLATFORM_LABELS: Record<string, string> = {
  noknok: "Noknok",
  toters: "Toters",
};

const QUICK_CATEGORIES = [
  { label: "🥛 Dairy", q: "milk cheese yogurt" },
  { label: "🧴 Shampoo", q: "shampoo hair" },
  { label: "🍪 Snacks", q: "chips snacks" },
  { label: "🧹 Cleaning", q: "cleaning detergent" },
  { label: "👶 Baby", q: "diapers baby" },
  { label: "🐾 Pet", q: "pet food cat dog" },
  { label: "💊 Health", q: "vitamins supplements" },
  { label: "☕ Coffee", q: "coffee tea" },
];

export default function RetailScreen() {
  const [tab, setTab] = useState<"search" | "basket">("search");

  // Search state
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RetailProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Basket state
  const [basketInput, setBasketInput] = useState("");
  const [basketItems, setBasketItems] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [comparison, setComparison] = useState<BasketComparison | null>(null);
  const [bestMixExpanded, setBestMixExpanded] = useState(false);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const results = await searchRetailProducts(q.trim());
      setSearchResults(results);
    } catch (e) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const addToBasket = (name: string) => {
    if (!name.trim() || basketItems.includes(name.trim())) return;
    setBasketItems(prev => [...prev, name.trim()]);
    setComparison(null);
  };

  const removeFromBasket = (name: string) => {
    setBasketItems(prev => prev.filter(i => i !== name));
    setComparison(null);
  };

  const handleCompare = useCallback(async () => {
    if (basketItems.length === 0) return;
    setComparing(true);
    try {
      const result = await compareBasket(basketItems);
      setComparison(result);
      setBestMixExpanded(false);
    } catch (e) {
      console.error(e);
    } finally {
      setComparing(false);
    }
  }, [basketItems]);

  const platformColors = Object.keys(comparison?.by_platform || {});
  const sortedPlatforms = platformColors.sort((a, b) =>
    (comparison?.by_platform[a]?.total ?? 999) - (comparison?.by_platform[b]?.total ?? 999)
  );
  const cheapestPlatform = sortedPlatforms[0];

  return (
    <View style={styles.container}>
      {/* Tab switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === "search" && styles.tabActive]}
          onPress={() => setTab("search")}
        >
          <Text style={[styles.tabText, tab === "search" && styles.tabTextActive]}>🔍 Search</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "basket" && styles.tabActive]}
          onPress={() => setTab("basket")}
        >
          <Text style={[styles.tabText, tab === "basket" && styles.tabTextActive]}>
            🛒 Basket {basketItems.length > 0 ? `(${basketItems.length})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === "search" ? (
        <View style={{ flex: 1 }}>
          {/* Search bar */}
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search products (milk, shampoo...)"
              placeholderTextColor="#999"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => handleSearch(query)}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => handleSearch(query)} style={styles.searchBtn}>
                <Text style={styles.searchBtnText}>Go</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Quick categories */}
          {!searched && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.quickCats}
              contentContainerStyle={styles.quickCatsContent}
            >
              {QUICK_CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c.q}
                  style={styles.catChip}
                  onPress={() => { setQuery(c.q); handleSearch(c.q); }}
                >
                  <Text style={styles.catChipText}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {searching ? (
            <ActivityIndicator size="large" color="#1DB954" style={{ marginTop: 40 }} />
          ) : searched && searchResults.length === 0 ? (
            <Text style={styles.emptyText}>No products found</Text>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={styles.productCard}>
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={styles.productImage} />
                  ) : (
                    <View style={[styles.productImage, styles.productImagePlaceholder]}>
                      <Text style={{ fontSize: 28 }}>🛍️</Text>
                    </View>
                  )}
                  <View style={styles.productInfo}>
                    <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
                    {item.brand ? <Text style={styles.productBrand}>{item.brand}</Text> : null}
                    <View style={styles.productMeta}>
                      <Text style={styles.productPrice}>${item.price_usd.toFixed(2)}</Text>
                      <View style={[styles.platformBadge, { backgroundColor: PLATFORM_COLORS[item.platform] || "#888" }]}>
                        <Text style={styles.platformBadgeText}>{PLATFORM_LABELS[item.platform] || item.platform}</Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.addBtn, basketItems.includes(item.name) && styles.addBtnAdded]}
                    onPress={() => basketItems.includes(item.name) ? removeFromBasket(item.name) : addToBasket(item.name)}
                  >
                    <Text style={styles.addBtnText}>{basketItems.includes(item.name) ? "✓" : "+"}</Text>
                  </TouchableOpacity>
                </View>
              )}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          )}
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Add item to basket */}
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Add item (e.g. Milk, Shampoo...)"
              placeholderTextColor="#999"
              value={basketInput}
              onChangeText={setBasketInput}
              onSubmitEditing={() => { addToBasket(basketInput); setBasketInput(""); }}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={() => { addToBasket(basketInput); setBasketInput(""); }}
            >
              <Text style={styles.searchBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {/* Basket items */}
          {basketItems.length === 0 ? (
            <View style={styles.emptyBasket}>
              <Text style={styles.emptyBasketIcon}>🛒</Text>
              <Text style={styles.emptyBasketText}>Your basket is empty</Text>
              <Text style={styles.emptyBasketSub}>Add items to compare prices across Toters & Noknok</Text>
            </View>
          ) : (
            <>
              <View style={styles.basketList}>
                {basketItems.map(item => (
                  <View key={item} style={styles.basketItem}>
                    <Text style={styles.basketItemText}>• {item}</Text>
                    <TouchableOpacity onPress={() => removeFromBasket(item)}>
                      <Text style={styles.removeBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.compareBtn, comparing && { opacity: 0.6 }]}
                onPress={handleCompare}
                disabled={comparing}
              >
                {comparing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.compareBtnText}>Compare Prices →</Text>
                )}
              </TouchableOpacity>

              {/* Comparison results */}
              {comparison && (
                <View style={styles.comparisonResults}>
                  <Text style={styles.comparisonTitle}>Price Comparison</Text>

                  {/* Platform totals */}
                  {sortedPlatforms.map((platform, idx) => {
                    const p = comparison.by_platform[platform];
                    const isCheapest = idx === 0;
                    return (
                      <View key={platform} style={[styles.platformCard, isCheapest && styles.platformCardBest]}>
                        <View style={styles.platformCardHeader}>
                          <View style={[styles.platformDot, { backgroundColor: PLATFORM_COLORS[platform] || "#888" }]} />
                          <Text style={styles.platformCardName}>{PLATFORM_LABELS[platform] || platform}</Text>
                          {isCheapest && <View style={styles.bestBadge}><Text style={styles.bestBadgeText}>CHEAPEST</Text></View>}
                        </View>
                        <Text style={styles.platformTotal}>${p.total.toFixed(2)}</Text>
                        <Text style={styles.platformCoverage}>
                          {p.coverage}/{basketItems.length} items found
                          {p.missing.length > 0 && ` · missing: ${p.missing.join(", ")}`}
                        </Text>
                      </View>
                    );
                  })}

                  {/* Best mix */}
                  <TouchableOpacity
                    style={styles.bestMixCard}
                    onPress={() => setBestMixExpanded(!bestMixExpanded)}
                  >
                    <View style={styles.bestMixHeader}>
                      <Text style={styles.bestMixTitle}>✨ Best Mix</Text>
                      <Text style={styles.bestMixTotal}>${comparison.best_mix.total.toFixed(2)}</Text>
                      <Text style={styles.bestMixChevron}>{bestMixExpanded ? "▲" : "▼"}</Text>
                    </View>
                    <Text style={styles.bestMixSub}>Buy each item from the cheapest store</Text>

                    {bestMixExpanded && (
                      <View style={styles.bestMixItems}>
                        {comparison.best_mix.items.map(item => (
                          <View key={item.searched} style={styles.bestMixItem}>
                            <Text style={styles.bestMixItemName} numberOfLines={1}>
                              {item.found || item.searched}
                            </Text>
                            <View style={styles.bestMixItemRight}>
                              {item.platform && (
                                <View style={[styles.platformBadge, { backgroundColor: PLATFORM_COLORS[item.platform] || "#888" }]}>
                                  <Text style={styles.platformBadgeText}>{PLATFORM_LABELS[item.platform] || item.platform}</Text>
                                </View>
                              )}
                              <Text style={styles.bestMixItemPrice}>
                                {item.price_usd ? `$${item.price_usd.toFixed(2)}` : "—"}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  tabBar: { flexDirection: "row", backgroundColor: "#111", borderBottomWidth: 1, borderBottomColor: "#222" },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#1DB954" },
  tabText: { color: "#888", fontSize: 14, fontWeight: "500" },
  tabTextActive: { color: "#1DB954" },
  searchRow: { flexDirection: "row", margin: 12, gap: 8 },
  searchInput: {
    flex: 1, backgroundColor: "#1a1a1a", color: "#fff", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: "#333",
  },
  searchBtn: { backgroundColor: "#1DB954", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  searchBtnText: { color: "#fff", fontWeight: "700" },
  quickCats: { paddingHorizontal: 12, marginBottom: 8, flexGrow: 0 },
  quickCatsContent: { flexDirection: "row", alignItems: "center", paddingRight: 12 },
  catChip: { backgroundColor: "#1a1a1a", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: "#333" },
  catChipText: { color: "#ddd", fontSize: 13 },
  emptyText: { color: "#666", textAlign: "center", marginTop: 40, fontSize: 16 },

  // Product card
  productCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#111",
    marginHorizontal: 12, marginBottom: 8, borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: "#222",
  },
  productImage: { width: 60, height: 60, borderRadius: 8, backgroundColor: "#1a1a1a" },
  productImagePlaceholder: { alignItems: "center", justifyContent: "center" },
  productInfo: { flex: 1, marginHorizontal: 10 },
  productName: { color: "#fff", fontSize: 14, fontWeight: "500" },
  productBrand: { color: "#888", fontSize: 12, marginTop: 2 },
  productMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  productPrice: { color: "#1DB954", fontSize: 15, fontWeight: "700" },
  platformBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  platformBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  addBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "#1DB954",
    alignItems: "center", justifyContent: "center",
  },
  addBtnAdded: { backgroundColor: "#333" },
  addBtnText: { color: "#fff", fontSize: 20, lineHeight: 22 },

  // Basket
  emptyBasket: { alignItems: "center", marginTop: 60, paddingHorizontal: 40 },
  emptyBasketIcon: { fontSize: 60, marginBottom: 16 },
  emptyBasketText: { color: "#fff", fontSize: 20, fontWeight: "600", marginBottom: 8 },
  emptyBasketSub: { color: "#666", fontSize: 14, textAlign: "center" },
  basketList: { marginHorizontal: 12, marginBottom: 16 },
  basketItem: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#111", borderRadius: 10, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: "#222",
  },
  basketItemText: { color: "#fff", fontSize: 15 },
  removeBtn: { color: "#666", fontSize: 16, padding: 4 },
  compareBtn: {
    backgroundColor: "#1DB954", marginHorizontal: 12, borderRadius: 12,
    paddingVertical: 14, alignItems: "center", marginBottom: 20,
  },
  compareBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Comparison
  comparisonResults: { marginHorizontal: 12 },
  comparisonTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  platformCard: {
    backgroundColor: "#111", borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: "#222",
  },
  platformCardBest: { borderColor: "#1DB954", borderWidth: 2 },
  platformCardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  platformDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  platformCardName: { color: "#fff", fontSize: 16, fontWeight: "600", flex: 1 },
  bestBadge: { backgroundColor: "#1DB954", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  bestBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  platformTotal: { color: "#fff", fontSize: 28, fontWeight: "700" },
  platformCoverage: { color: "#888", fontSize: 12, marginTop: 4 },
  bestMixCard: {
    backgroundColor: "#1a1a1a", borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: "#444",
  },
  bestMixHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  bestMixTitle: { color: "#fff", fontSize: 16, fontWeight: "700", flex: 1 },
  bestMixTotal: { color: "#FFD700", fontSize: 22, fontWeight: "700" },
  bestMixChevron: { color: "#666", fontSize: 12 },
  bestMixSub: { color: "#888", fontSize: 12, marginTop: 4 },
  bestMixItems: { marginTop: 12, gap: 8 },
  bestMixItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bestMixItemName: { color: "#ddd", fontSize: 13, flex: 1 },
  bestMixItemRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  bestMixItemPrice: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
