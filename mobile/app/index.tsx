import { useState, useCallback, useEffect } from "react";
import {
  View, Text, TextInput, FlatList, Image, StyleSheet,
  ActivityIndicator, TouchableOpacity, SafeAreaView,
  Modal, ScrollView, Platform, Linking,
} from "react-native";
import { searchDishes, searchRestaurants, getTrending, Dish, Restaurant, TrendingDish } from "../services/api";

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
  const [restaurantPage, setRestaurantPage] = useState<{ id: string; name: string; logo: string } | null>(null);
  const [restaurantDishes, setRestaurantDishes] = useState<Dish[]>([]);
  const [restaurantLoading, setRestaurantLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [priceFilter, setPriceFilter] = useState<"all" | "under10" | "10to20" | "over20">("all");
  const [sort, setSort] = useState<string>("relevance");
  const [restaurantResults, setRestaurantResults] = useState<Restaurant[]>([]);
  const [showA2HS, setShowA2HS] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [budget, setBudget] = useState<number | null>(null);
  const [showBudget, setShowBudget] = useState(false);
  const [alertDish, setAlertDish] = useState<Dish | null>(null);
  const [alertPrice, setAlertPrice] = useState("");
  const [alertSaved, setAlertSaved] = useState(false);
  const [sharedComparison, setSharedComparison] = useState(false);
  const [trending, setTrending] = useState<{ up: TrendingDish[]; down: TrendingDish[] } | null>(null);

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

  // Price alerts — check on app open
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    const alerts: Array<{ dishId: number; dishName: string; restaurantName: string; maxPrice: number; currency: string }> =
      JSON.parse(localStorage.getItem("price_alerts") || "[]");
    if (!alerts.length) return;
    // Check each alert by searching the dish name
    alerts.forEach(async (alert) => {
      try {
        const dishes = await searchDishes(alert.dishName, undefined, undefined, undefined, undefined, "price_asc");
        const match = dishes.find(d => d.id === alert.dishId);
        if (!match) return;
        const currentPrice = match.price_usd > 0 ? match.price_usd : match.price_lbp / 89500;
        if (currentPrice <= alert.maxPrice) {
          const price = match.price_usd > 0 ? `$${match.price_usd.toFixed(2)}` : `${Math.round(match.price_lbp / 1000)}k LBP`;
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(`💰 Price alert: ${alert.dishName}`, {
              body: `Now ${price} at ${alert.restaurantName}`,
            });
          }
        }
      } catch {}
    });
  }, []);

  const saveAlert = (dish: Dish, maxPriceUsd: number) => {
    if (typeof localStorage === "undefined") return;
    const alerts: any[] = JSON.parse(localStorage.getItem("price_alerts") || "[]");
    const existing = alerts.findIndex(a => a.dishId === dish.id);
    const entry = {
      dishId: dish.id, dishName: dish.dish_name,
      restaurantName: dish.restaurant_name,
      maxPrice: maxPriceUsd, currency: "usd",
    };
    if (existing >= 0) alerts[existing] = entry;
    else alerts.push(entry);
    localStorage.setItem("price_alerts", JSON.stringify(alerts));
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
    getTrending().then(setTrending).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { setUserLat(pos.coords.latitude); setUserLon(pos.coords.longitude); },
        () => {}
      );
    }
  }, []);

  const doSearch = useCallback(async (q: string, cuisine?: string, sortOverride?: string) => {
    setQuery(q);
    setLoading(true);
    setSearched(true);
    if (q.trim()) saveRecent(q.trim());
    const activeSort = sortOverride ?? sort;
    try {
      const [dishes, restaurants] = await Promise.all([
        searchDishes(q.trim(), userLat, userLon, cuisine, undefined, activeSort),
        q.trim() ? searchRestaurants(q.trim()).catch(() => []) : Promise.resolve([]),
      ]);
      setResults(dishes);
      setRestaurantResults(restaurants);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userLat, userLon, recentSearches, sort]);

  const handleSearch = useCallback(() => doSearch(query), [query, doSearch]);

  const changeSort = useCallback((newSort: string) => {
    setSort(newSort);
    if (searched && query.trim()) {
      doSearch(query, undefined, newSort);
    }
  }, [searched, query, doSearch]);

  const openRestaurantPage = useCallback(async (id: string, name: string, logo: string) => {
    setRestaurantPage({ id, name, logo });
    setRestaurantLoading(true);
    setExpandedCategories(new Set());
    try {
      const dishes = await searchDishes("", undefined, undefined, undefined, id);
      setRestaurantDishes(dishes);
      // Auto-expand first category
      if (dishes.length > 0) {
        const firstCat = dishes[0].category || "Other";
        setExpandedCategories(new Set([firstCat]));
      }
    } catch (e) { console.error(e); }
    finally { setRestaurantLoading(false); }
  }, []);

  const filteredResults = results.filter(d => {
    const usd = d.price_usd > 0 ? d.price_usd : d.price_lbp > 0 ? d.price_lbp / 89500 : null;
    if (usd === null) return priceFilter === "all" && !budget;
    if (priceFilter === "under10" && usd >= 10) return false;
    if (priceFilter === "10to20" && (usd < 10 || usd > 20)) return false;
    if (priceFilter === "over20" && usd <= 20) return false;
    if (budget !== null && usd > budget) return false;
    return true;
  });

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
            <TouchableOpacity style={styles.backBtn} onPress={() => { setSearched(false); setQuery(""); setResults([]); setRestaurantResults([]); setPriceFilter("all"); setSort("relevance"); }}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsCount}>
                <Text style={styles.resultsCountBold}>{filteredResults.length}</Text> results for "<Text style={styles.resultsCountBold}>{query}</Text>"
              </Text>
              {userLat ? <Text style={styles.resultsSorted}>📍 sorted by distance</Text> : null}
            </View>

            {/* Restaurant matches */}
            {restaurantResults.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Restaurants</Text>
                {restaurantResults.map(r => (
                  <TouchableOpacity
                    key={r.id}
                    style={styles.restaurantCard}
                    onPress={() => openRestaurantPage(r.id, r.name, r.logo_url)}
                    activeOpacity={0.85}
                  >
                    {r.logo_url ? (
                      <Image source={{ uri: r.logo_url }} style={styles.restaurantCardLogo} />
                    ) : (
                      <View style={[styles.restaurantCardLogo, styles.restaurantCardLogoPlaceholder]}>
                        <Text style={{ fontSize: 22 }}>🏠</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.restaurantCardName}>{r.name}</Text>
                      {r.cuisine ? <Text style={styles.restaurantCardCuisine}>{r.cuisine}</Text> : null}
                    </View>
                    <View style={styles.restaurantCardRight}>
                      <Text style={styles.restaurantCardDishes}>{r.dish_count} dishes</Text>
                      <Text style={styles.restaurantCardArrow}>›</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {results.length > 0 && <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Dishes</Text>}
              </>
            )}

            {/* Sort bar */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              {([
                ["relevance", "⭐ Relevant"],
                ["price_asc", "💰 Cheapest"],
                ["price_desc", "🏆 Priciest"],
                ...(userLat ? [["distance", "📍 Nearest"], ["value", "🎯 Best Value"]] as [string,string][] : []),
              ] as [string, string][]).map(([val, label]) => (
                <TouchableOpacity key={val} style={[styles.filterChip, sort === val && styles.filterChipActive]} onPress={() => changeSort(val)}>
                  <Text style={[styles.filterChipText, sort === val && styles.filterChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Price filter + budget row */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filterBar, { marginBottom: 4 }]} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              {([["all","All"],["under10","Under $10"],["10to20","$10–$20"],["over20","Over $20"]] as const).map(([val, label]) => (
                <TouchableOpacity key={val} style={[styles.filterChipOutline, priceFilter === val && styles.filterChipActive]} onPress={() => setPriceFilter(val)}>
                  <Text style={[styles.filterChipText, priceFilter === val && styles.filterChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.filterChipOutline, budget !== null && styles.filterChipActive]}
                onPress={() => setShowBudget(true)}
              >
                <Text style={[styles.filterChipText, budget !== null && styles.filterChipTextActive]}>
                  {budget !== null ? `🎯 Under $${budget}` : "🎯 My Budget"}
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* WhatsApp comparison share */}
            {filteredResults.length > 1 && (
              <TouchableOpacity
                style={styles.shareCompareBtn}
                onPress={() => {
                  const lines = filteredResults.slice(0, 8).map(d => {
                    const price = d.price_usd > 0 ? `$${d.price_usd.toFixed(2)}` : `${Math.round(d.price_lbp / 1000)}k LBP`;
                    return `• ${d.restaurant_name}: ${price}`;
                  });
                  const text = encodeURIComponent(
                    `🍽 ${query} prices in Beirut:\n${lines.join("\n")}\n\nCompare more on menuze 👉 https://elienasr123.github.io/menuze/`
                  );
                  if (typeof window !== "undefined") window.location.href = `https://wa.me/?text=${text}`;
                  setSharedComparison(true);
                  setTimeout(() => setSharedComparison(false), 2000);
                }}
              >
                <Text style={styles.shareCompareBtnText}>
                  {sharedComparison ? "✓ Shared!" : `📤 Share ${query} price comparison`}
                </Text>
              </TouchableOpacity>
            )}

            {(() => {
              const withPrice = filteredResults.filter(d => d.price_usd > 0);
              const minPrice = withPrice.length ? Math.min(...withPrice.map(d => d.price_usd)) : null;
              const bestId = minPrice !== null ? withPrice.find(d => d.price_usd === minPrice)?.id : null;
              return filteredResults.map((item) => (
                <DishCard key={item.id} dish={item}
                  onPress={() => setSelectedDish(item)}
                  onRestaurantPress={() => openRestaurantPage(item.restaurant_id, item.restaurant_name, item.logo_url)}
                  isBestPrice={item.id === bestId} />
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

            {/* 📊 Lebanon Price Index */}
            {trending && (trending.up.length > 0 || trending.down.length > 0) && (
              <>
                <Text style={styles.sectionLabel}>📊 Lebanon Price Index</Text>
                <Text style={styles.trendSubtitle}>Recent price changes across Beirut restaurants</Text>

                {trending.down.length > 0 && (
                  <>
                    <Text style={styles.trendGroupLabel}>📉 Price dropped</Text>
                    {trending.down.slice(0, 5).map(d => (
                      <TouchableOpacity key={d.id} style={styles.trendRow}
                        onPress={() => openRestaurantPage(d.restaurant_id, d.restaurant_name, d.logo_url)}>
                        {d.logo_url ? <Image source={{ uri: d.logo_url }} style={styles.trendLogo} /> :
                          <View style={[styles.trendLogo, { backgroundColor: "#F5F5F5", alignItems: "center", justifyContent: "center" }]}><Text>🍽</Text></View>}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.trendDishName} numberOfLines={1}>{d.dish_name}</Text>
                          <Text style={styles.trendRestaurant} numberOfLines={1}>{d.restaurant_name}</Text>
                        </View>
                        <View style={styles.trendPriceCol}>
                          <Text style={styles.trendPriceCurrent}>
                            {d.price_usd > 0 ? `$${d.price_usd.toFixed(2)}` : `${Math.round(d.price_lbp / 1000)}k`}
                          </Text>
                          <Text style={styles.trendBadgeDown}>{d.change_pct}%</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                )}

                {trending.up.length > 0 && (
                  <>
                    <Text style={[styles.trendGroupLabel, { color: "#E53E3E" }]}>📈 Price went up</Text>
                    {trending.up.slice(0, 5).map(d => (
                      <TouchableOpacity key={d.id} style={styles.trendRow}
                        onPress={() => openRestaurantPage(d.restaurant_id, d.restaurant_name, d.logo_url)}>
                        {d.logo_url ? <Image source={{ uri: d.logo_url }} style={styles.trendLogo} /> :
                          <View style={[styles.trendLogo, { backgroundColor: "#F5F5F5", alignItems: "center", justifyContent: "center" }]}><Text>🍽</Text></View>}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.trendDishName} numberOfLines={1}>{d.dish_name}</Text>
                          <Text style={styles.trendRestaurant} numberOfLines={1}>{d.restaurant_name}</Text>
                        </View>
                        <View style={styles.trendPriceCol}>
                          <Text style={styles.trendPriceCurrent}>
                            {d.price_usd > 0 ? `$${d.price_usd.toFixed(2)}` : `${Math.round(d.price_lbp / 1000)}k`}
                          </Text>
                          <Text style={styles.trendBadgeUp}>+{d.change_pct}%</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Restaurant page modal */}
      <Modal visible={!!restaurantPage} animationType="slide" transparent onRequestClose={() => setRestaurantPage(null)}>
        <SafeAreaView style={styles.restaurantPage}>
          {/* Header */}
          <View style={styles.restaurantPageHeader}>
            <TouchableOpacity onPress={() => setRestaurantPage(null)}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
            <View style={styles.restaurantPageTitle}>
              {restaurantPage?.logo ? (
                <Image source={{ uri: restaurantPage.logo }} style={styles.restaurantPageLogo} />
              ) : null}
              <Text style={styles.restaurantPageName} numberOfLines={1}>{restaurantPage?.name}</Text>
            </View>
          </View>

          {restaurantLoading ? (
            <ActivityIndicator size="large" color="#FF4D00" style={{ marginTop: 60 }} />
          ) : (() => {
            // Group dishes by category, preserving insertion order
            const categoryMap: Record<string, Dish[]> = {};
            for (const dish of restaurantDishes) {
              const cat = dish.category?.trim() || "Other";
              if (!categoryMap[cat]) categoryMap[cat] = [];
              categoryMap[cat].push(dish);
            }
            const categories = Object.keys(categoryMap);

            const toggleCategory = (cat: string) => {
              setExpandedCategories(prev => {
                const next = new Set(prev);
                if (next.has(cat)) next.delete(cat);
                else next.add(cat);
                return next;
              });
            };

            return (
              <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
                {/* Dish count summary */}
                <View style={styles.menuSummary}>
                  <Text style={styles.menuSummaryText}>
                    {categories.length} categories · {restaurantDishes.length} dishes
                  </Text>
                </View>

                {categories.map(cat => {
                  const isOpen = expandedCategories.has(cat);
                  const dishes = categoryMap[cat];
                  return (
                    <View key={cat} style={styles.categoryBlock}>
                      {/* Category header — tap to expand/collapse */}
                      <TouchableOpacity
                        style={styles.categoryHeader}
                        onPress={() => toggleCategory(cat)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.categoryHeaderLeft}>
                          <Text style={styles.categoryName}>{cat}</Text>
                          <Text style={styles.categoryCount}>{dishes.length} item{dishes.length !== 1 ? "s" : ""}</Text>
                        </View>
                        <Text style={[styles.categoryArrow, isOpen && styles.categoryArrowOpen]}>›</Text>
                      </TouchableOpacity>

                      {/* Dishes — shown when expanded */}
                      {isOpen && (
                        <View style={styles.categoryDishes}>
                          {dishes.map(dish => (
                            <RestaurantDishRow
                              key={dish.id}
                              dish={dish}
                              onPress={() => setSelectedDish(dish)}
                            />
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            );
          })()}
        </SafeAreaView>
      </Modal>

      {/* Dish detail modal */}
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
                    {selectedDish.price_usd > 0 ? (
                      <>
                        <Text style={styles.sheetPriceUsd}>${selectedDish.price_usd.toFixed(2)}</Text>
                        {selectedDish.price_lbp > 0 && (
                          <Text style={styles.sheetPriceLbp}>{Math.round(selectedDish.price_lbp / 1000)}k LBP</Text>
                        )}
                      </>
                    ) : selectedDish.price_lbp > 0 ? (
                      <Text style={styles.sheetPriceUsd}>{Math.round(selectedDish.price_lbp / 1000)}k LBP</Text>
                    ) : null}
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
                    <TouchableOpacity
                      style={styles.btnAlert}
                      onPress={() => { setAlertDish(selectedDish); setAlertPrice(""); setAlertSaved(false); }}
                    >
                      <Text style={styles.btnAlertText}>🔔 Alert me if price drops</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      {/* Budget modal */}
      <Modal visible={showBudget} animationType="slide" transparent onRequestClose={() => setShowBudget(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowBudget(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.sheetBody}>
              <Text style={styles.sheetDishName}>🎯 Set My Budget</Text>
              <Text style={styles.sheetDesc}>Only show dishes under your budget (in USD)</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginVertical: 16 }}>
                {[5, 10, 15, 20, 30, 50].map(v => (
                  <TouchableOpacity
                    key={v}
                    style={[styles.budgetChip, budget === v && styles.budgetChipActive]}
                    onPress={() => { setBudget(v); setShowBudget(false); }}
                  >
                    <Text style={[styles.budgetChipText, budget === v && styles.budgetChipTextActive]}>${v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {budget !== null && (
                <TouchableOpacity style={styles.btnGoogle} onPress={() => { setBudget(null); setShowBudget(false); }}>
                  <Text style={styles.btnGoogleText}>✕ Clear budget</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Price alert modal */}
      <Modal visible={!!alertDish} animationType="slide" transparent onRequestClose={() => setAlertDish(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setAlertDish(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            {alertDish && (
              <View style={styles.sheetBody}>
                <Text style={styles.sheetDishName}>🔔 Price Alert</Text>
                <Text style={styles.sheetDesc}>
                  Alert me when <Text style={{ fontWeight: "700", color: "#111" }}>{alertDish.dish_name}</Text> at {alertDish.restaurant_name} drops below:
                </Text>
                {/* Current price */}
                <View style={[styles.sheetPriceRow, { marginBottom: 8 }]}>
                  <Text style={{ fontSize: 13, color: "#888" }}>Current price: </Text>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#FF4D00" }}>
                    {alertDish.price_usd > 0 ? `$${alertDish.price_usd.toFixed(2)}` : `${Math.round(alertDish.price_lbp / 1000)}k LBP`}
                  </Text>
                </View>
                {/* Price input */}
                <View style={styles.alertInputRow}>
                  <Text style={styles.alertDollar}>$</Text>
                  <TextInput
                    style={styles.alertInput}
                    placeholder="e.g. 8"
                    placeholderTextColor="#BBB"
                    keyboardType="decimal-pad"
                    value={alertPrice}
                    onChangeText={setAlertPrice}
                  />
                </View>
                {alertSaved ? (
                  <View style={styles.alertSuccess}>
                    <Text style={styles.alertSuccessText}>✓ Alert saved! We'll notify you when the price drops.</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.btnDirections, { marginTop: 16 }]}
                    onPress={async () => {
                      const max = parseFloat(alertPrice);
                      if (isNaN(max) || max <= 0) return;
                      // Request notification permission
                      if (typeof Notification !== "undefined" && Notification.permission === "default") {
                        await Notification.requestPermission();
                      }
                      saveAlert(alertDish, max);
                      setAlertSaved(true);
                    }}
                  >
                    <Text style={styles.btnDirectionsText}>Save Alert</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function RestaurantDishRow({ dish, onPress }: { dish: Dish; onPress: () => void }) {
  const hasUsd = dish.price_usd > 0;
  const hasLbp = dish.price_lbp >= 1000;

  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.8}>
      {/* Dish info */}
      <View style={styles.menuRowBody}>
        <Text style={styles.menuRowName} numberOfLines={2}>{dish.dish_name}</Text>
        {dish.description ? (
          <Text style={styles.menuRowDesc} numberOfLines={2}>{dish.description}</Text>
        ) : null}
        <View style={styles.menuRowPriceRow}>
          {hasUsd ? (
            <>
              <Text style={styles.menuRowPrice}>${dish.price_usd.toFixed(2)}</Text>
              {hasLbp && (
                <Text style={styles.menuRowPriceLbp}>{Math.round(dish.price_lbp / 1000)}k LBP</Text>
              )}
            </>
          ) : hasLbp ? (
            <Text style={styles.menuRowPrice}>{Math.round(dish.price_lbp / 1000)}k LBP</Text>
          ) : null}
        </View>
      </View>
      {/* Dish image */}
      {dish.image_url ? (
        <Image source={{ uri: dish.image_url }} style={styles.menuRowImage} />
      ) : (
        <View style={styles.menuRowImagePlaceholder}>
          <Text style={{ fontSize: 22 }}>🍽</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function priceTrend(dish: Dish): "up" | "down" | null {
  const cur = dish.price_usd > 0 ? dish.price_usd : dish.price_lbp / 89500;
  const prev = dish.prev_price_usd != null && dish.prev_price_usd > 0
    ? dish.prev_price_usd
    : dish.prev_price_lbp != null && dish.prev_price_lbp > 0
    ? dish.prev_price_lbp / 89500
    : null;
  if (!prev || !cur) return null;
  if (cur > prev * 1.01) return "up";
  if (cur < prev * 0.99) return "down";
  return null;
}

function DishCard({ dish, onPress, onRestaurantPress, isBestPrice }: { dish: Dish; onPress: () => void; onRestaurantPress?: () => void; isBestPrice?: boolean }) {
  const [shared, setShared] = useState(false);
  const trend = priceTrend(dish);

  const shareOnWhatsApp = (e: any) => {
    e.stopPropagation();
    const price = dish.price_usd > 0 ? `$${dish.price_usd.toFixed(2)}` : `${Math.round(dish.price_lbp / 1000)}k LBP`;
    const text = encodeURIComponent(`🍽 ${dish.dish_name} at ${dish.restaurant_name} for ${price}\nFind more deals on menuze 👉 https://elienasr123.github.io/menuze/`);
    if (typeof window !== "undefined") window.location.href = `https://wa.me/?text=${text}`;
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  const hasUsd = dish.price_usd > 0;
  const hasLbp = dish.price_lbp > 0;

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
        <TouchableOpacity style={styles.restaurantRow} onPress={onRestaurantPress} disabled={!onRestaurantPress}>
          {dish.logo_url ? (
            <Image source={{ uri: dish.logo_url }} style={styles.logo_img} />
          ) : null}
          <Text style={[styles.restaurantName, onRestaurantPress && styles.restaurantNameLink]} numberOfLines={1}>{dish.restaurant_name}</Text>
        </TouchableOpacity>
        {dish.description ? (
          <Text style={styles.description} numberOfLines={1}>{dish.description}</Text>
        ) : null}
        {dish.distance_km != null && (
          <Text style={styles.distance}>📍 {dish.distance_km} km</Text>
        )}
      </View>
      <View style={styles.priceBox}>
        {hasUsd ? (
          <>
            <Text style={styles.price}>${dish.price_usd.toFixed(2)}</Text>
            {hasLbp && <Text style={styles.priceLbp}>{Math.round(dish.price_lbp / 1000)}k LBP</Text>}
          </>
        ) : hasLbp ? (
          <Text style={styles.priceLbpMain}>{Math.round(dish.price_lbp / 1000)}k{"\n"}LBP</Text>
        ) : null}
        {trend === "down" && <Text style={styles.trendArrowDown}>↓</Text>}
        {trend === "up" && <Text style={styles.trendArrowUp}>↑</Text>}
        <TouchableOpacity onPress={shareOnWhatsApp} style={[styles.shareBtn, shared && styles.shareBtnDone]}>
          <Text style={styles.shareBtnText}>{shared ? "✓" : "↗"}</Text>
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
  restaurantNameLink: { color: "#FF4D00", textDecorationLine: "underline" },
  description: { fontSize: 11, color: "#BBB", lineHeight: 15 },
  distance: { fontSize: 11, color: "#FF4D00", marginTop: 3, fontWeight: "600" },
  priceBox: { justifyContent: "center", alignItems: "flex-end", paddingHorizontal: 10, minWidth: 70 },
  price: { fontSize: 15, fontWeight: "800", color: "#FF4D00" },
  priceLbp: { fontSize: 10, color: "#AAA", marginTop: 2 },
  priceLbpMain: { fontSize: 12, fontWeight: "800", color: "#FF4D00", textAlign: "right" },
  shareBtn: { marginTop: 8, backgroundColor: "#F0F0F0", borderRadius: 8, width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  shareBtnDone: { backgroundColor: "#D4EDDA" },
  shareBtnText: { fontSize: 14, color: "#555", fontWeight: "700" },

  // Filter bar
  filterBar: { marginBottom: 10 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#FF4D00" },
  filterChipOutline: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E8E8E8" },
  filterChipActive: { backgroundColor: "#FF4D00", borderColor: "#FF4D00" },
  filterChipText: { fontSize: 13, color: "#555", fontWeight: "600" },
  filterChipTextActive: { color: "#fff" },

  // Restaurant search card
  restaurantCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    borderRadius: 16, marginHorizontal: 16, marginBottom: 8, padding: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    borderWidth: 1.5, borderColor: "#FFD4C2",
  },
  restaurantCardLogo: { width: 48, height: 48, borderRadius: 10, marginRight: 12 },
  restaurantCardLogoPlaceholder: { backgroundColor: "#FFF5F2", alignItems: "center", justifyContent: "center" },
  restaurantCardName: { fontSize: 15, fontWeight: "800", color: "#111", marginBottom: 2 },
  restaurantCardCuisine: { fontSize: 12, color: "#AAA" },
  restaurantCardRight: { alignItems: "flex-end", gap: 2 },
  restaurantCardDishes: { fontSize: 12, color: "#FF4D00", fontWeight: "700" },
  restaurantCardArrow: { fontSize: 22, color: "#FF4D00", fontWeight: "300" },

  // Restaurant page
  restaurantPage: { flex: 1, backgroundColor: "#F8F8F6" },
  restaurantPageHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F0F0F0", gap: 12 },
  restaurantPageTitle: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  restaurantPageLogo: { width: 36, height: 36, borderRadius: 8 },
  restaurantPageName: { fontSize: 16, fontWeight: "800", color: "#111", flex: 1 },

  // Menu summary
  menuSummary: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  menuSummaryText: { fontSize: 13, color: "#AAA", fontWeight: "600" },

  // Category accordion
  categoryBlock: { borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  categoryHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 16, backgroundColor: "#fff",
  },
  categoryHeaderLeft: { flex: 1 },
  categoryName: { fontSize: 16, fontWeight: "800", color: "#111" },
  categoryCount: { fontSize: 12, color: "#AAA", marginTop: 2 },
  categoryArrow: { fontSize: 24, color: "#CCC", fontWeight: "300", transform: [{ rotate: "0deg" }] },
  categoryArrowOpen: { transform: [{ rotate: "90deg" }], color: "#FF4D00" },
  categoryDishes: { backgroundColor: "#FAFAFA", paddingBottom: 8 },

  // Menu dish row (inside restaurant page)
  menuRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#F5F5F5",
    backgroundColor: "#fff",
  },
  menuRowBody: { flex: 1, paddingRight: 12 },
  menuRowName: { fontSize: 14, fontWeight: "700", color: "#111", marginBottom: 3 },
  menuRowDesc: { fontSize: 12, color: "#AAA", lineHeight: 17, marginBottom: 6 },
  menuRowPriceRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  menuRowPrice: { fontSize: 15, fontWeight: "800", color: "#FF4D00" },
  menuRowPriceLbp: { fontSize: 11, color: "#AAA" },
  menuRowImage: { width: 72, height: 72, borderRadius: 10 },
  menuRowImagePlaceholder: {
    width: 72, height: 72, borderRadius: 10,
    backgroundColor: "#F5F5F5", alignItems: "center", justifyContent: "center",
  },

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
  btnAlert: { backgroundColor: "#FFF5F2", borderRadius: 14, paddingVertical: 15, alignItems: "center", borderWidth: 1.5, borderColor: "#FFD4C2" },
  btnAlertText: { color: "#FF4D00", fontWeight: "700", fontSize: 15 },

  // Share comparison
  shareCompareBtn: {
    marginHorizontal: 16, marginBottom: 10, backgroundColor: "#25D366",
    borderRadius: 14, paddingVertical: 12, alignItems: "center",
  },
  shareCompareBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Budget chips
  budgetChip: {
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14,
    backgroundColor: "#F5F5F5", borderWidth: 1.5, borderColor: "#E8E8E8",
  },
  budgetChipActive: { backgroundColor: "#FF4D00", borderColor: "#FF4D00" },
  budgetChipText: { fontSize: 16, fontWeight: "700", color: "#333" },
  budgetChipTextActive: { color: "#fff" },

  // Alert input
  alertInputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#E8E8E8", borderRadius: 14, paddingHorizontal: 16, marginBottom: 4 },
  alertDollar: { fontSize: 20, fontWeight: "700", color: "#FF4D00", marginRight: 4 },
  alertInput: { flex: 1, fontSize: 20, paddingVertical: 14, color: "#111" },
  alertSuccess: { backgroundColor: "#D4EDDA", borderRadius: 12, padding: 14, marginTop: 14 },
  alertSuccessText: { color: "#155724", fontWeight: "600", textAlign: "center" },

  // Trend arrows on dish cards
  trendArrowDown: { fontSize: 13, fontWeight: "800", color: "#22C55E", marginTop: 2 },
  trendArrowUp: { fontSize: 13, fontWeight: "800", color: "#E53E3E", marginTop: 2 },

  // Price index section
  trendSubtitle: { fontSize: 12, color: "#AAA", marginHorizontal: 16, marginBottom: 12, marginTop: -6 },
  trendGroupLabel: { fontSize: 13, fontWeight: "700", color: "#22C55E", marginHorizontal: 16, marginBottom: 6, marginTop: 4 },
  trendRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    marginHorizontal: 16, marginBottom: 6, borderRadius: 12, padding: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  trendLogo: { width: 36, height: 36, borderRadius: 8, marginRight: 10 },
  trendDishName: { fontSize: 13, fontWeight: "700", color: "#111" },
  trendRestaurant: { fontSize: 11, color: "#AAA", marginTop: 1 },
  trendPriceCol: { alignItems: "flex-end", gap: 3 },
  trendPriceCurrent: { fontSize: 14, fontWeight: "800", color: "#111" },
  trendBadgeDown: { fontSize: 11, fontWeight: "700", color: "#22C55E", backgroundColor: "#F0FFF4", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  trendBadgeUp: { fontSize: 11, fontWeight: "700", color: "#E53E3E", backgroundColor: "#FFF5F5", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
});
