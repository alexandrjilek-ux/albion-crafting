// Top items — hlavní obrazovka. Champion podium pro top 3 + leaderboard
// pro 4–10. Filter chips (city + mode). iPad >= 768px → three-pane layout.

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ChampionPodium,
  FilterChips,
  GlowCard,
  HeroCard,
  ItemRow,
  MultiFilterChips,
  PriceHistoryChart,
  SectionHeader,
  StatBadge,
  ThemeToggle,
} from '../../src/components';
import { useTopItems } from '../../src/hooks/useTopItems';
import {
  AUTO_CITY,
  type AnalysisMode,
  type CityOrAuto,
  type HistoryPoint,
  type ResourceBreakdownRow,
  type SortKey,
  type MarketMode,
  type TopItemsRequest,
  type TopItemRow,
} from '../../src/api/types';
import { useLanguage, type LanguageCode } from '../../src/i18n/LanguageProvider';
import { colors, type AppColors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeProvider';
import { breakpoints, glow, radius, spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import {
  categoryEmoji,
  albionItemIconUrl,
  formatPercent,
  formatProfit,
  formatRoute,
  formatSilver,
} from '../../src/utils/format';
import { useActivitiesBonuses } from '../../src/activities/ActivitiesBonusProvider';

const MODE_FILTERS: ReadonlyArray<{ value: AnalysisMode; label: string }> = [
  { value: 'equipment', label: 'Equipment' },
  { value: 'food', label: 'Food' },
];

// Tiers per mode — equipment začíná na T4 (T3 nemá expert spec ani vznikající
// gear v tom rangi), food má T3 maily. Backend approval z původního Streamlitu.
const EQUIPMENT_TIERS: ReadonlyArray<number> = [4, 5, 6, 7, 8];
const FOOD_TIERS: ReadonlyArray<number> = [3, 4, 5, 6, 7, 8];
const DEFAULT_EQUIPMENT_TIERS: ReadonlyArray<number> = [4, 5, 6];
const DEFAULT_FOOD_TIERS: ReadonlyArray<number> = [3, 4, 5, 6];

const ENCHANT_FILTERS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: '.0' },
  { value: 1, label: '.1' },
  { value: 2, label: '.2' },
  { value: 3, label: '.3' },
];

// Focus budget presets — typické hodnoty:
//   10k = full premium daily
//   20k = uložené z víkendu
//   30k = max cap
// Ostatní hodnoty (5k, 15k, 7.3k …) jdou napsat ručně přes TextInput pod chipy.
const FOCUS_BUDGET_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 10_000, label: '10k' },
  { value: 20_000, label: '20k' },
  { value: 30_000, label: '30k' },
];

// Min daily volume — kolik prodejů za 7 dní musí item mít, aby se ukázal.
// Tři rozumné presets pro flippery (likvidní trh) — pro nestandardní hodnoty
// (0, 5, 200) custom input pod chipy.
const VOLUME_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 20, label: '20+' },
  { value: 50, label: '50+' },
  { value: 100, label: '100+' },
];

const COPY: Record<LanguageCode, {
  mode: string;
  useFocus: string;
  noFocus: string;
  minVolume: string;
  salesUnit: string;
  sellCity: string;
  noCaerleon: string;
  includeCaerleon: string;
  normalMarket: string;
  blackMarketOnly: string;
  blackMarketOnlyHint: string;
  todaysForge: string;
  updated: string;
  items: string;
  loading: string;
  noData: string;
  noResults: string;
  loadingHint: string;
  advancedFilters: string;
  podium: string;
  top3: string;
  leaderboard: string;
  all: string;
  noMoreItems: string;
  localCraftDetail: string;
  selectedItem: string;
  searchIdleTitle: string;
  searchIdleText: string;
  topExpectedProfit: string;
  medianTop10: string;
  dailyChampion: string;
  pickLeaderboard: string;
  localCraft: string;
  profitWithFocus: string;
  sold7d: string;
  profitNoFocus: string;
  costNoFocus: string;
  costWithFocus: string;
  sellPrice: string;
  netRevenue: string;
  craftsFromFocus: string;
  dailyFocusProfit: string;
  craftCity: string;
  localMarket: string;
  recipeResources: string;
  noResources: string;
  marketHistory: string;
  marketHistorySubtitle: string;
  perDay: string;
  noPriceHistory: string;
  soldTotal: string;
  lastDay: string;
  noVolume: string;
  sold: string;
  searching: (mode: AnalysisMode) => string;
  custom: string;
  analysisFailed: string;
  retry: string;
}> = {
  cs: {
    mode: 'Mod',
    useFocus: 'Pouzivat focus',
    noFocus: 'Bez focusu',
    minVolume: 'Min. volume / 7 dni',
    salesUnit: 'prodeju',
    sellCity: 'Sell city',
    noCaerleon: 'Bez Caerleonu',
    includeCaerleon: 'Vcetne Caerleonu',
    normalMarket: 'Normalni mesta',
    blackMarketOnly: 'Jen Black Market',
    blackMarketOnlyHint: 'Pouzije Caerleon Black Market buy ordery jako prodejni cenu.',
    todaysForge: "Today's Forge",
    updated: 'Aktualizovano',
    items: 'polozek',
    loading: 'Nacitam...',
    noData: 'Zadna data',
    noResults: 'Zadne vysledky pro vybrany filtr.',
    loadingHint: 'Stahuji ceny z AODP... muze trvat 30-90 s pri prvnim nacteni.',
    advancedFilters: 'Pokrocile filtry',
    podium: 'Podium',
    top3: 'Top 3 dnes',
    leaderboard: 'Leaderboard',
    all: 'Vse',
    noMoreItems: 'Zadne dalsi polozky.',
    localCraftDetail: 'Local craft detail',
    selectedItem: 'Vybrany item',
    searchIdleTitle: 'Nastav filtry a spust Search',
    searchIdleText: 'Hledani se uz nespousti automaticky, aby backend netahal AODP data pri kazde zmene filtru.',
    topExpectedProfit: 'Top expected profit',
    medianTop10: 'Median z top 10',
    dailyChampion: 'DAILY CHAMPION',
    pickLeaderboard: 'Vyber polozku v leaderboardu.',
    localCraft: 'LOCAL CRAFT',
    profitWithFocus: 'Profit s focusem',
    sold7d: 'Prodano / 7d',
    profitNoFocus: 'Profit bez focusu',
    costNoFocus: 'Cost bez focusu',
    costWithFocus: 'Cost s focusem',
    sellPrice: 'Sell price',
    netRevenue: 'Net revenue',
    craftsFromFocus: 'Crafts z focusu',
    dailyFocusProfit: 'Daily focus profit',
    craftCity: 'Craft city',
    localMarket: 'Local market',
    recipeResources: 'Recept / suroviny',
    noResources: 'Backend neposlal rozpad surovin pro tenhle craft.',
    marketHistory: 'Market history',
    marketHistorySubtitle: 'Cena a prodane kusy v lokalnim marketu',
    perDay: '/ den',
    noPriceHistory: 'Zadna cenova historie pro lokalni market.',
    soldTotal: 'Prodano celkem',
    lastDay: 'Posledni den',
    noVolume: 'Zadne volume za posledni dny.',
    sold: 'prodano',
    searching: (mode) => `Hledam ${mode === 'food' ? 'food itemy' : 'equipment'}...`,
    custom: 'Vlastni',
    analysisFailed: 'Analyza se nepovedla',
    retry: 'Tap pro retry',
  },
  en: {
    mode: 'Mode',
    useFocus: 'Use focus',
    noFocus: 'No focus',
    minVolume: 'Min. volume / 7 days',
    salesUnit: 'sales',
    sellCity: 'Sell city',
    noCaerleon: 'No Caerleon',
    includeCaerleon: 'Include Caerleon',
    normalMarket: 'Normal cities',
    blackMarketOnly: 'Black Market only',
    blackMarketOnlyHint: 'Uses Caerleon Black Market buy orders as the sell price.',
    todaysForge: "Today's Forge",
    updated: 'Updated',
    items: 'items',
    loading: 'Loading...',
    noData: 'No data',
    noResults: 'No results for the selected filter.',
    loadingHint: 'Fetching AODP prices... first load can take 30-90 seconds.',
    advancedFilters: 'Advanced filters',
    podium: 'Podium',
    top3: 'Top 3 today',
    leaderboard: 'Leaderboard',
    all: 'All',
    noMoreItems: 'No more items.',
    localCraftDetail: 'Local craft detail',
    selectedItem: 'Selected item',
    searchIdleTitle: 'Set filters and run Search',
    searchIdleText: 'Search no longer runs automatically, so the backend does not pull AODP data after every filter change.',
    topExpectedProfit: 'Top expected profit',
    medianTop10: 'Median from top 10',
    dailyChampion: 'DAILY CHAMPION',
    pickLeaderboard: 'Pick an item from the leaderboard.',
    localCraft: 'LOCAL CRAFT',
    profitWithFocus: 'Profit with focus',
    sold7d: 'Sold / 7d',
    profitNoFocus: 'Profit without focus',
    costNoFocus: 'Cost without focus',
    costWithFocus: 'Cost with focus',
    sellPrice: 'Sell price',
    netRevenue: 'Net revenue',
    craftsFromFocus: 'Crafts from focus',
    dailyFocusProfit: 'Daily focus profit',
    craftCity: 'Craft city',
    localMarket: 'Local market',
    recipeResources: 'Recipe / resources',
    noResources: 'Backend did not send a resource breakdown for this craft.',
    marketHistory: 'Market history',
    marketHistorySubtitle: 'Price and sold volume in the local market',
    perDay: '/ day',
    noPriceHistory: 'No price history for the local market.',
    soldTotal: 'Sold total',
    lastDay: 'Last day',
    noVolume: 'No volume in recent days.',
    sold: 'sold',
    searching: (mode) => `Searching ${mode === 'food' ? 'food items' : 'equipment'}...`,
    custom: 'Custom',
    analysisFailed: 'Analysis failed',
    retry: 'Tap to retry',
  },
};

export default function TopItemsScreen() {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const { selectedCategories } = useActivitiesBonuses();
  const copy = COPY[language];
  styles = makeTopItemsStyles(themeColors);
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isTablet = width >= breakpoints.tablet;

  // City selector byl odstraněn — vždy běží auto mode (best craft city per
  // item). Specific-city výsledky jsou skoro identické s auto a UI tím
  // spamuje filtry, které uživatel nepoužívá.
  const city: CityOrAuto = AUTO_CITY;
  const [mode, setMode] = useState<AnalysisMode>('equipment');
  const [selected, setSelected] = useState<TopItemRow | null>(null);

  // Pokročilé filtry — initial defaults matchují původní Streamlit verzi.
  const [tiers, setTiers] = useState<number[]>([...DEFAULT_EQUIPMENT_TIERS]);
  const [enchants, setEnchants] = useState<number[]>([0]);
  const [useFocus, setUseFocus] = useState<boolean>(true);
  const [focusBudget, setFocusBudget] = useState<number>(10_000);
  // min_volume=20 default — match nejnižšího presetu, takže je hned chip
  // highlighted. Pro mrtvější itemy může uživatel napsat 1/5 do custom inputu.
  const [minVolume, setMinVolume] = useState<number>(20);
  // Caerleon je default VYPNUTÝ (no_caerleon=true) — black zone transport je
  // riziko, výsledky s Caerleonem jsou často "papírové" (cena je tam vyšší,
  // ale dostat tam item znamená PvP). Uživatel si ho může zapnout v
  // pokročilých filtrech když ví, co dělá.
  const [noCaerleon, setNoCaerleon] = useState<boolean>(true);
  const [marketMode, setMarketMode] = useState<MarketMode>('royal_no_caerleon');
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const [submittedReq, setSubmittedReq] = useState<TopItemsRequest | null>(null);

  // Když uživatel přepne mode, tiers se musí resetovat — equipment a food
  // mají různé povolené tiery (food začíná T3) a různé sensible defaulty.
  // Bez tohohle by zůstal stale výběr (např. po food→equipment by zůstal T3
  // a backend by stejně vrátil prázdno, protože equipment T3 nemá data).
  const handleModeChange = (newMode: AnalysisMode) => {
    setMode(newMode);
    setTiers(
      newMode === 'equipment'
        ? [...DEFAULT_EQUIPMENT_TIERS]
        : [...DEFAULT_FOOD_TIERS],
    );
  };

  const tierFilters = useMemo<ReadonlyArray<{ value: number; label: string }>>(
    () =>
      (mode === 'equipment' ? EQUIPMENT_TIERS : FOOD_TIERS).map((t) => ({
        value: t,
        label: `T${t}`,
      })),
    [mode],
  );

  const hasEnchantedFilter =
    mode === 'equipment' && enchants.some((enchant) => enchant > 0);
  const effectiveMinVolume = hasEnchantedFilter
    ? minVolume === 20
      ? 3
      : Math.max(1, minVolume)
    : minVolume;

  const req = useMemo<TopItemsRequest>(
    () => {
      const sortBy: SortKey = useFocus ? 'profit_focus' : 'profit_no_focus';
      return {
        city,
        mode,
        // Setříděné kvůli stabilnímu reqHash v useTopItems (Set ordering by jinak
        // občas trigeroval refetch při shodné selekci v jiném pořadí).
        tiers: [...tiers].sort((a, b) => a - b),
        enchants: mode === 'food' ? [0] : [...enchants].sort((a, b) => a - b),
        use_focus: useFocus,
        focus_budget: focusBudget,
        top: 30,
        sort_by: sortBy,
        min_volume: effectiveMinVolume,
        no_caerleon: noCaerleon,
        ...(isWeb && marketMode === 'black_market_only' ? { market_mode: marketMode } : {}),
        activity_bonus_categories: selectedCategories,
      };
    },
    [city, mode, tiers, enchants, useFocus, focusBudget, effectiveMinVolume, noCaerleon, isWeb, marketMode, selectedCategories],
  );

  const toggleTier = (t: number) => {
    setTiers((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };
  const toggleEnchant = (e: number) => {
    setEnchants((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e],
    );
  };

  const reqDirty = JSON.stringify(req) !== JSON.stringify(submittedReq);
  const hasSearched = submittedReq !== null;

  const { data, loading, error, progress, refetch, refresh } = useTopItems(submittedReq);
  const handleSearch = () => {
    setSelected(null);
    if (hasSearched && !reqDirty) {
      void refetch();
      return;
    }
    setSubmittedReq(req);
  };

  // Pull-to-refresh — používá `refresh()` (preservuje data, jen overlayuje
  // nativní spinner nahoře). `refreshing` musí jít na false po dokončení,
  // jinak by spinner zamrzl.
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const onPullToRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onPullToRefresh}
      tintColor={colors.arcane}
      colors={[colors.arcane]}
      progressBackgroundColor={colors.surface1}
    />
  );

  const rows = data?.rows ?? [];
  const champion = rows[0];
  const podium = rows.slice(0, 3);
  const leaderboard = rows.slice(3, 10);
  const tail = rows.slice(10, 24);

  // iPad three-pane fallback selection — defaultně champion.
  const detailItem = selected ?? champion ?? null;

  if (isTablet) {
    return (
      <SafeAreaView edges={['top']} style={styles.canvas}>
        <View style={styles.iPadGrid}>
          {/* Left sidebar — filters + brand */}
          <ScrollView style={styles.iPadSide} contentContainerStyle={styles.iPadSideContent}>
            <Brand />
            <ThemeToggle />
            <Text style={styles.navSection}>{copy.mode}</Text>
            <FilterChips
              items={MODE_FILTERS}
              active={mode}
              onChange={handleModeChange}
              activeTone="arcane"
              scrollable={false}
            />
            <Text style={styles.navSection}>Tier</Text>
            <MultiFilterChips
              items={tierFilters}
              active={tiers}
              onToggle={toggleTier}
              activeTone="arcane"
              scrollable={false}
            />
            {mode === 'equipment' ? (
              <>
                <Text style={styles.navSection}>Enchant</Text>
                <MultiFilterChips
                  items={ENCHANT_FILTERS}
                  active={enchants}
                  onToggle={toggleEnchant}
                  activeTone="rose"
                  scrollable={false}
                />
              </>
            ) : null}
            <Text style={styles.navSection}>Focus</Text>
            <View style={styles.focusToggleRow}>
              <Pressable
                onPress={() => setUseFocus((v) => !v)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.focusSwitch,
                  useFocus && styles.focusSwitchOn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.focusSwitchText, useFocus && styles.focusSwitchTextOn]}>
                  {useFocus ? copy.useFocus : copy.noFocus}
                </Text>
              </Pressable>
            </View>
            {useFocus ? (
              <View style={{ marginTop: spacing.xs }}>
                <NumberPickerWithCustom
                  value={focusBudget}
                  onChange={setFocusBudget}
                  presets={FOCUS_BUDGET_PRESETS}
                  unit="focus"
                  placeholder="10000"
                  scrollable={false}
                  minValue={1}
                  maxValue={30_000}
                />
              </View>
            ) : null}
            <Text style={styles.navSection}>{copy.minVolume}</Text>
            <NumberPickerWithCustom
              value={minVolume}
              onChange={setMinVolume}
              presets={VOLUME_PRESETS}
              unit={copy.salesUnit}
              placeholder="20"
              scrollable={false}
              minValue={0}
              maxValue={200}
            />
            <Text style={styles.navSection}>Sell city</Text>
            <View style={styles.focusToggleRow}>
              <Pressable
                onPress={() => setNoCaerleon((v) => !v)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.focusSwitch,
                  noCaerleon && styles.focusSwitchOn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    styles.focusSwitchText,
                    noCaerleon && styles.focusSwitchTextOn,
                  ]}
                >
                  {noCaerleon ? copy.noCaerleon : copy.includeCaerleon}
                </Text>
              </Pressable>
            </View>
            {isWeb ? (
              <MarketModeSwitch
                value={marketMode}
                onChange={setMarketMode}
              />
            ) : null}
            <SearchButton
              loading={loading}
              dirty={reqDirty}
              hasSearched={hasSearched}
              onPress={handleSearch}
            />
            {data?.warning ? <Warning text={data.warning} /> : null}
          </ScrollView>

          {/* Middle — leaderboard + KPI */}
          <ScrollView
            style={styles.iPadMain}
            contentContainerStyle={styles.iPadMainContent}
            refreshControl={refreshControl}
          >
            <Text style={styles.iPadH1}>{copy.todaysForge}</Text>
            <Text style={styles.iPadSub}>
              {data
                ? `${copy.updated} ${data.generated_at} - ${data.count} ${copy.items} - craft city: ${data.craft_city}`
                : loading
                  ? copy.loading
                  : copy.noData}
            </Text>
            <KpiStrip rows={rows} />
            {!hasSearched ? (
              <SearchIdle />
            ) : error ? (
              <ErrorBlock error={error} onRetry={refetch} />
            ) : (
              <View style={styles.leaderboard}>
                <View style={styles.lbHead}>
                  <Text style={[styles.lbHeadCell, { width: 28 }]}>#</Text>
                  <Text style={[styles.lbHeadCell, { flex: 1 }]}>Item</Text>
                  <Text style={[styles.lbHeadCell, styles.lbHeadRight]}>Profit</Text>
                  <Text style={[styles.lbHeadCell, styles.lbHeadRight]}>Margin</Text>
                </View>
                {rows.slice(0, 12).map((it, idx) => (
                  <ItemRow
                    key={getKey(it, idx)}
                    item={it}
                    rank={idx + 1}
                    onPress={(item) => setSelected(item)}
                    isLast={idx === Math.min(11, rows.length - 1)}
                    compact
                  />
                ))}
                {!loading && rows.length === 0 ? (
                  <Text style={styles.empty}>{copy.noResults}</Text>
                ) : null}
                {loading ? (
                  <View style={styles.loadingBlock}>
                    <ActivityIndicator color={colors.arcane} />
                    <LoadingProgress mode={mode} progress={progress} />
                    <Text style={styles.loadingHint}>
                      {copy.loadingHint}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </ScrollView>

          {/* Right — detail panel */}
          <ScrollView
            style={styles.iPadDetail}
            contentContainerStyle={styles.iPadDetailContent}
          >
            <DetailPanel item={detailItem} />
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  // ───────── iPhone layout ─────────
  return (
    <SafeAreaView edges={['top']} style={styles.canvas}>
      <View style={styles.topbar}>
        <Brand />
        <ThemeToggle />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        <View style={styles.filtersRow}>
          <FilterChips
            items={MODE_FILTERS}
            active={mode}
            onChange={handleModeChange}
            activeTone="arcane"
          />
        </View>

        {/* Pokročilé filtry — defaultně skryté, expand button. Streamlit
            ekvivalent: sidebar se vším najednou. Mobile prefer toggle, jinak
            scroll je extrémní. */}
        <Pressable
          onPress={() => setFiltersOpen((v) => !v)}
          style={({ pressed }) => [
            styles.advancedToggle,
            pressed && { opacity: 0.7 },
          ]}
          hitSlop={6}
        >
          <Ionicons
            name={filtersOpen ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={colors.textSecondary}
          />
          <Text style={styles.advancedToggleText}>
            {copy.advancedFilters}
          </Text>
          <Text style={styles.advancedToggleSummary}>
            {summarizeFilters(
              tiers,
              mode === 'food' ? [0] : enchants,
              useFocus,
              focusBudget,
              effectiveMinVolume,
              noCaerleon,
              language,
            )}
          </Text>
        </Pressable>

        {filtersOpen ? (
          <GlowCard style={styles.advancedPanel}>
            <Text style={styles.navSection}>Tier</Text>
            <View style={styles.filtersRow}>
              <MultiFilterChips
                items={tierFilters}
                active={tiers}
                onToggle={toggleTier}
                activeTone="arcane"
              />
            </View>

            {mode === 'equipment' ? (
              <>
                <Text style={styles.navSection}>Enchant</Text>
                <View style={styles.filtersRow}>
                  <MultiFilterChips
                    items={ENCHANT_FILTERS}
                    active={enchants}
                    onToggle={toggleEnchant}
                    activeTone="rose"
                  />
                </View>
              </>
            ) : null}

            <Text style={styles.navSection}>Focus</Text>
            <View style={styles.focusToggleRow}>
              <Pressable
                onPress={() => setUseFocus((v) => !v)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.focusSwitch,
                  useFocus && styles.focusSwitchOn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.focusSwitchText, useFocus && styles.focusSwitchTextOn]}>
                  {useFocus ? copy.useFocus : copy.noFocus}
                </Text>
              </Pressable>
            </View>
            {useFocus ? (
              <View style={styles.filtersRow}>
                <NumberPickerWithCustom
                  value={focusBudget}
                  onChange={setFocusBudget}
                  presets={FOCUS_BUDGET_PRESETS}
                  unit="focus"
                  placeholder="10000"
                  scrollable
                  minValue={1}
                  maxValue={30_000}
                />
              </View>
            ) : null}

            <Text style={styles.navSection}>{copy.minVolume}</Text>
            <View style={styles.filtersRow}>
              <NumberPickerWithCustom
                value={minVolume}
                onChange={setMinVolume}
                presets={VOLUME_PRESETS}
                unit={copy.salesUnit}
                placeholder="20"
                scrollable
                minValue={0}
                maxValue={200}
              />
            </View>

            <Text style={styles.navSection}>Sell city</Text>
            <View style={styles.focusToggleRow}>
              <Pressable
                onPress={() => setNoCaerleon((v) => !v)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.focusSwitch,
                  noCaerleon && styles.focusSwitchOn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    styles.focusSwitchText,
                    noCaerleon && styles.focusSwitchTextOn,
                  ]}
                >
                  {noCaerleon ? copy.noCaerleon : copy.includeCaerleon}
                </Text>
              </Pressable>
            </View>
            {isWeb ? (
              <MarketModeSwitch
                value={marketMode}
                onChange={setMarketMode}
              />
            ) : null}
          </GlowCard>
        ) : null}

        <SearchButton
          loading={loading}
          dirty={reqDirty}
          hasSearched={hasSearched}
          onPress={handleSearch}
        />

        {!hasSearched ? (
          <SearchIdle />
        ) : error ? (
          <ErrorBlock error={error} onRetry={refetch} />
        ) : (
          <>
            <HeroCard item={champion} loading={loading && !champion} />

            <SectionHeader
              title={copy.podium}
              subtitle={copy.top3}
              actionLabel={`${copy.leaderboard} >`}
            />
            {loading ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator color={colors.arcane} size="large" />
                <LoadingProgress mode={mode} progress={progress} />
                <Text style={styles.loadingHint}>
                  {copy.loadingHint}
                </Text>
              </View>
            ) : (
              <ChampionPodium
                items={podium}
                onPressItem={(item) => setSelected(item)}
              />
            )}

            <SectionHeader title={copy.leaderboard} subtitle="4-10" actionLabel={data ? `${copy.all} ${data.count} >` : undefined} />
            <GlowCard padded={false}>
              {leaderboard.length === 0 && !loading ? (
                <Text style={styles.empty}>{copy.noMoreItems}</Text>
              ) : null}
              {leaderboard.map((it, idx) => (
                <ItemRow
                  key={getKey(it, idx + 3)}
                  item={it}
                  rank={idx + 4}
                  onPress={(item) => setSelected(item)}
                  isLast={idx === leaderboard.length - 1}
                />
              ))}
            </GlowCard>

            {selected ? (
              <>
                <SectionHeader
                  title={copy.localCraftDetail}
                  subtitle={selected.craft_city ?? copy.localCraft}
                />
                <GlowCard style={styles.selectedDetailCard}>
                  <View style={styles.detailActionRow}>
                    <Text style={styles.detailActionTitle}>{copy.selectedItem}</Text>
                    <Pressable
                      onPress={() => setSelected(null)}
                      hitSlop={8}
                      style={({ pressed }) => [styles.detailCloseButton, pressed && { opacity: 0.7 }]}
                    >
                      <Ionicons name="close" size={16} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                  <DetailPanel item={selected} />
                </GlowCard>
              </>
            ) : null}

            <FreshnessBar rows={[...podium, ...leaderboard, ...tail]} />
          </>
        )}
      </ScrollView>
      <Modal
        visible={selected !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)} />
          <SafeAreaView edges={['bottom']} style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{copy.localCraftDetail}</Text>
              <Pressable
                onPress={() => setSelected(null)}
                hitSlop={8}
                style={({ pressed }) => [styles.detailCloseButton, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="close" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <DetailPanel item={selected} />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── helper components ─────────────────────────────────────────────────

function Brand() {
  return (
    <View style={styles.brand}>
      <View style={styles.crest}>
        <Text style={styles.crestText}>A</Text>
      </View>
      <View>
        <Text style={styles.brandName}>Albion Crafting</Text>
        <Text style={styles.brandSub}>Crafting · Daily</Text>
      </View>
    </View>
  );
}

function SearchButton({
  loading,
  dirty,
  hasSearched,
  onPress,
}: {
  loading: boolean;
  dirty: boolean;
  hasSearched: boolean;
  onPress: () => void;
}) {
  const label = loading
    ? 'Searching...'
    : !hasSearched
      ? 'Search'
      : dirty
        ? 'Search again'
        : 'Search';

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.searchButton,
        loading ? styles.searchButtonDisabled : null,
        pressed ? styles.searchButtonPressed : null,
      ]}
    >
      <Ionicons
        name={loading ? 'hourglass-outline' : 'search'}
        size={18}
        color={colors.textPrimary}
      />
      <Text style={styles.searchButtonText}>{label}</Text>
      {dirty && hasSearched && !loading ? <View style={styles.searchDirtyDot} /> : null}
    </Pressable>
  );
}

function MarketModeSwitch({
  value,
  onChange,
}: {
  value: MarketMode;
  onChange: (value: MarketMode) => void;
}) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const isBlackMarket = value === 'black_market_only';

  return (
    <View style={styles.marketModeBox}>
      <View style={styles.marketModeRow}>
        <Pressable
          onPress={() => onChange('royal_no_caerleon')}
          hitSlop={8}
          style={({ pressed }) => [
            styles.marketModeChip,
            !isBlackMarket && styles.marketModeChipActive,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.marketModeText, !isBlackMarket && styles.marketModeTextActive]}>
            {copy.normalMarket}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChange('black_market_only')}
          hitSlop={8}
          style={({ pressed }) => [
            styles.marketModeChip,
            isBlackMarket && styles.marketModeChipActive,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons
            name="skull-outline"
            size={14}
            color={isBlackMarket ? colors.frost : colors.textMuted}
          />
          <Text style={[styles.marketModeText, isBlackMarket && styles.marketModeTextActive]}>
            {copy.blackMarketOnly}
          </Text>
        </Pressable>
      </View>
      {isBlackMarket ? (
        <Text style={styles.marketModeHint}>{copy.blackMarketOnlyHint}</Text>
      ) : null}
    </View>
  );
}

function SearchIdle() {
  const { language } = useLanguage();
  const copy = COPY[language];
  return (
    <GlowCard style={styles.searchIdleCard}>
      <Ionicons name="options-outline" size={24} color={colors.arcane} />
      <Text style={styles.searchIdleTitle}>{copy.searchIdleTitle}</Text>
      <Text style={styles.searchIdleText}>
        {copy.searchIdleText}
      </Text>
    </GlowCard>
  );
}

function KpiStrip({ rows }: { rows: TopItemRow[] }) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const top = rows[0]?.profit_focus_conservative ?? rows[0]?.profit_focus ?? rows[0]?.expected_profit;
  const median =
    rows.length > 0
      ? rows
          .slice(0, 10)
          .map((r) => (r.profit_focus_conservative as number) ?? (r.profit_focus as number) ?? (r.expected_profit as number) ?? 0)
          .sort((a, b) => a - b)[Math.min(4, rows.length - 1)]
      : undefined;

  return (
    <View style={styles.kpiRow}>
      <GlowCard variant="arcane" style={styles.kpi}>
        <Text style={styles.kpiLabel}>{copy.topExpectedProfit}</Text>
        <Text style={[styles.kpiValue, { color: colors.arcane }]}>
          {formatSilver(top as number | undefined)}
        </Text>
      </GlowCard>
      <GlowCard style={styles.kpi}>
        <Text style={styles.kpiLabel}>{copy.medianTop10}</Text>
        <Text style={styles.kpiValue}>{formatSilver(median)}</Text>
      </GlowCard>
      <GlowCard style={styles.kpi}>
        <Text style={styles.kpiLabel}>{copy.items}</Text>
        <Text style={[styles.kpiValue, { color: colors.frost }]}>{rows.length}</Text>
      </GlowCard>
    </View>
  );
}

function DetailPanel({ item }: { item: TopItemRow | null }) {
  const { language } = useLanguage();
  const copy = COPY[language];
  if (!item) {
    return (
      <View style={styles.detailEmpty}>
        <Text style={styles.detailEye}>★ DAILY CHAMPION</Text>
        <Text style={styles.detailTitle}>—</Text>
        <Text style={styles.empty}>{copy.pickLeaderboard}</Text>
      </View>
    );
  }

  const profit = (item.profit_focus_conservative as number | undefined) ?? (item.profit_focus as number | undefined) ?? (item.expected_profit as number | undefined);
  const profitNoFocus = (item.profit_no_focus_conservative as number | undefined) ?? (item.profit_no_focus as number | undefined);
  const craftsWithFocus = (item.crafts_with_focus as number | undefined) ?? (item.batch_size as number | undefined) ?? (item.sellable_crafts_estimate as number | undefined);
  const dailyProfit = (item._daily_profit as number | undefined) ?? (item.risk_adjusted_daily_profit as number | undefined);
  const focusCost = item.focus_cost as number | undefined;
  const margin = item['margin_focus_%'] as number | undefined;
  const sellPrice = item.sell_price_conservative ?? item.sell_price;
  const isBlackMarket = item.sell_price_source === 'black_market_buy_max' || item.sell_city === 'Black Market';
  const costNoFocus = item.eff_cost_no_focus ?? item.nominal_cost;
  const costFocus = item.eff_cost_focus;
  const netRevenue = item.net_revenue_conservative ?? item.net_revenue;
  const resourceBreakdown = getResourceBreakdown(item);
  const totalMaterials = resourceBreakdown.reduce((sum, row) => sum + (row.subtotal ?? 0), 0);
  const history = getHistoryPoints(item);
  const totalSold = history.reduce((sum, point) => sum + point.item_count, 0);
  const avgSold =
    (item.avg_daily_volume as number | undefined) ??
    (item.daily_volume as number | undefined) ??
    (history.length > 0 ? Math.round(totalSold / history.length) : undefined);
  const itemName =
    item.item_name ??
    (item.name_en as string | undefined) ??
    (item.unique_name as string | undefined) ??
    '—';
  const itemCode =
    (item.item_id as string | undefined) ??
    (item.unique_name as string | undefined) ??
    'unknown';

  return (
    <View>
      <View style={styles.detailHero}>
        <ItemArt
          itemId={(item.item_id as string | undefined) ?? (item.unique_name as string | undefined)}
          category={item.category as string | undefined}
        />
        <View style={styles.detailHeroCopy}>
          <Text style={styles.detailEye}>{copy.localCraft}</Text>
          <Text style={styles.detailTitle}>
            {itemName}
          </Text>
          <Text style={styles.detailUnique} numberOfLines={1}>
            {itemCode}
          </Text>
          <View style={styles.detailTags}>
            {item.tier ? <StatBadge label={`T${item.tier}`} tone="arcane" /> : null}
            {item.enchant ? <StatBadge label={`.${item.enchant}`} tone="rose" /> : null}
            {item.category ? <StatBadge label={item.category.toLowerCase().replace(/_/g, ' ')} tone="default" /> : null}
            {margin !== undefined ? <StatBadge label={formatPercent(margin)} tone="frost" /> : null}
            {isBlackMarket ? <StatBadge label="BM buy order" tone="rose" /> : null}
          </View>
        </View>
      </View>

      <View style={styles.detailSummaryBand}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>{copy.profitWithFocus}</Text>
          <Text style={styles.summaryValue}>{formatProfit(profit)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>Crafts</Text>
          <Text style={styles.summaryValueAlt}>{craftsWithFocus ?? 0}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>{copy.sold7d}</Text>
          <Text style={styles.summaryValueAlt}>{totalSold || '—'}</Text>
        </View>
      </View>

      <CraftRecipeResources
        resources={resourceBreakdown}
        totalMaterials={totalMaterials}
      />

      <View style={styles.kpiGrid}>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>Profit (focus)</Text>
          <Text style={[styles.kpiValue, { color: colors.frost }]}>{formatProfit(profit)}</Text>
        </View>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>{copy.profitNoFocus}</Text>
          <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>{formatProfit(profitNoFocus)}</Text>
        </View>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>{copy.costNoFocus}</Text>
          <Text style={styles.kpiValue}>{formatSilver(costNoFocus)}</Text>
        </View>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>{copy.costWithFocus}</Text>
          <Text style={styles.kpiValue}>{formatSilver(costFocus)}</Text>
        </View>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>{isBlackMarket ? 'BM buy order' : copy.sellPrice}</Text>
          <Text style={styles.kpiValue}>{formatSilver(sellPrice)}</Text>
        </View>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>{copy.netRevenue}</Text>
          <Text style={styles.kpiValue}>{formatSilver(netRevenue)}</Text>
        </View>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>{copy.craftsFromFocus}</Text>
          <Text style={[styles.kpiValue, { color: colors.arcane }]}>{craftsWithFocus ?? 0}</Text>
        </View>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>{copy.dailyFocusProfit}</Text>
          <Text style={[styles.kpiValue, { color: colors.frost }]}>{formatProfit(dailyProfit)}</Text>
        </View>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>Margin</Text>
          <Text style={[styles.kpiValue, { color: colors.arcane }]}>{formatPercent(margin)}</Text>
        </View>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>Focus / craft</Text>
          <Text style={styles.kpiValue}>{focusCost ?? 0}</Text>
        </View>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>{copy.craftCity}</Text>
          <Text style={styles.kpiValue}>{item.craft_city ?? '—'}</Text>
        </View>
      </View>

      <MarketHistory history={history} avgSold={avgSold} />

      <Text style={styles.detailEye}>{copy.localMarket}</Text>
      <Text style={styles.tradeRoute}>{formatRoute(item.craft_city, item.sell_city)}</Text>
    </View>
  );
}

function ItemArt({ itemId, category }: { itemId?: string; category?: string }) {
  const [failed, setFailed] = useState(false);
  const iconUrl = albionItemIconUrl(itemId, { size: 217 });

  return (
    <View style={styles.detailArt}>
      {iconUrl && !failed ? (
        <Image
          source={{ uri: iconUrl }}
          style={styles.detailArtImage}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={styles.detailArtFallback}>{categoryEmoji(category)}</Text>
      )}
    </View>
  );
}

function ResourceIcon({ id }: { id?: string }) {
  const [failed, setFailed] = useState(false);
  const iconUrl = albionItemIconUrl(id, { size: 64 });

  return (
    <View style={styles.resourceIcon}>
      {iconUrl && !failed ? (
        <Image
          source={{ uri: iconUrl }}
          style={styles.resourceIconImage}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={styles.resourceIconFallback}>*</Text>
      )}
    </View>
  );
}

function CraftRecipeResources({
  resources,
  totalMaterials,
}: {
  resources: ResourceBreakdownRow[];
  totalMaterials: number;
}) {
  const { language } = useLanguage();
  const copy = COPY[language];
  return (
    <View style={styles.resourcesBlock}>
      <View style={styles.resourcesHeader}>
        <Text style={styles.detailEye}>{copy.recipeResources}</Text>
        <Text style={styles.resourceTotal}>{formatSilver(totalMaterials)}</Text>
      </View>
      {resources.length > 0 ? (
        resources.map((resource, idx) => (
          <View
            key={`${resource.id ?? 'resource'}-${idx}`}
            style={[
              styles.resourceRow,
              idx === resources.length - 1 ? null : styles.resourceDivider,
            ]}
          >
            <ResourceIcon id={resource.id} />
            <View style={styles.resourceNameWrap}>
              <Text style={styles.resourceName} numberOfLines={1}>
                {formatResourceName(resource.id)}
              </Text>
              <Text style={styles.resourceMeta}>
                {formatQty(resource.qty)} x {formatSilver(resource.price_per_unit)}
              </Text>
            </View>
            <Text style={styles.resourceSubtotal}>{formatSilver(resource.subtotal)}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>{copy.noResources}</Text>
      )}
    </View>
  );
}

function MarketHistory({
  history,
  avgSold,
}: {
  history: HistoryPoint[];
  avgSold: number | undefined;
}) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const totalSold = history.reduce((sum, point) => sum + point.item_count, 0);
  const lastVolume = history[history.length - 1]?.item_count;

  return (
    <View style={styles.historyBlock}>
      <View style={styles.historyHeader}>
        <View>
          <Text style={styles.detailEye}>{copy.marketHistory}</Text>
          <Text style={styles.historySubtitle}>{copy.marketHistorySubtitle}</Text>
        </View>
        <View style={styles.historyPill}>
          <Text style={styles.historyPillValue}>{avgSold ?? '—'}</Text>
          <Text style={styles.historyPillLabel}>{copy.perDay}</Text>
        </View>
      </View>
      <PriceHistoryChart
        history={history}
        color={colors.frost}
        height={92}
        emptyHint={copy.noPriceHistory}
      />
      <View style={styles.volumeSummary}>
        <Text style={styles.volumeSummaryText}>{copy.soldTotal} {totalSold || '—'}</Text>
        <Text style={styles.volumeSummaryText}>{copy.lastDay} {lastVolume ?? '—'}</Text>
      </View>
      <SalesVolumeChart history={history} />
    </View>
  );
}

function SalesVolumeChart({ history }: { history: HistoryPoint[] }) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const points = history.filter((point) => point.item_count >= 0);
  const max = Math.max(...points.map((point) => point.item_count), 0);
  const [selectedIndex, setSelectedIndex] = useState(Math.max(points.length - 1, 0));

  if (points.length === 0 || max === 0) {
    return (
      <View style={styles.volumeEmpty}>
        <Text style={styles.empty}>{copy.noVolume}</Text>
      </View>
    );
  }
  const selected = points[Math.min(selectedIndex, points.length - 1)] ?? points[points.length - 1]!;

  return (
    <>
      <View style={styles.volumeChart}>
        {points.map((point, idx) => {
          const height = Math.max(5, (point.item_count / max) * 46);
          const isLast = idx === points.length - 1;
          const isSelected = selected === point;
          return (
            <Pressable
              key={`${point.date}-${idx}`}
              onPress={() => setSelectedIndex(idx)}
              style={styles.volumeBarSlot}
              hitSlop={4}
            >
              <View
                style={[
                  styles.volumeBar,
                  isSelected ? styles.volumeBarSelected : null,
                  {
                    height,
                    backgroundColor: isLast || isSelected ? colors.arcane : colors.frost,
                    opacity: isLast || isSelected ? 1 : 0.55,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.volumeSelectedRow}>
        <Text style={styles.volumeSummaryText}>{formatShortHistoryDate(selected.date)}</Text>
        <Text style={styles.volumeSummaryText}>{selected.item_count} {copy.sold}</Text>
      </View>
    </>
  );
}

function FreshnessBar({ rows }: { rows: TopItemRow[] }) {
  const buckets = rows.reduce<{ hot: number; stale: number; cold: number }>(
    (acc, r) => {
      const v = (r.daily_volume as number | undefined) ?? (r.avg_daily_volume as number | undefined) ?? 0;
      if (v < 5) acc.cold += 1;
      else if (v < 15) acc.stale += 1;
      else acc.hot += 1;
      return acc;
    },
    { hot: 0, stale: 0, cold: 0 },
  );

  return (
    <View style={styles.freshnessRow}>
      <FreshnessChip color={colors.freshHot} label={`${buckets.hot} hot`} />
      <FreshnessChip color={colors.freshStale} label={`${buckets.stale} stale`} />
      <FreshnessChip color={colors.freshCold} label={`${buckets.cold} cold`} />
    </View>
  );
}

// LoadingProgress — ukazuje per-city progress z backendu ("Stahuji
// Bridgewatch (1/5)") a sekundy jako fallback pro případ, že progress event
// ještě nedorazil (start → first poll trvá ~500 ms).
//
// Když `progress` je null (ještě nezačal job nebo už hotový), zobrazí
// generický "Hledám equipment…" + sekundy. Při tab switchi food↔equipment
// useTopItems vyčistí progress přes setProgress(null), takže komponent
// začíná čistě.
function LoadingProgress({
  mode,
  progress,
}: {
  mode: AnalysisMode;
  progress: import('../../src/hooks/useTopItems').ProgressState | null;
}) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const start = Date.now();
    setSeconds(0);
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Když máme reálný progress event, prefer ho. Jinak generic.
  const primary = progress ? progress.label : copy.searching(mode);
  const counter =
    progress && progress.total > 1
      ? `${progress.step}/${progress.total}`
      : `${seconds}s`;

  return (
    <View style={styles.loadingTimerRow}>
      <Text style={styles.loadingTimerText}>{primary}</Text>
      <Text style={styles.loadingTimerValue}>{counter}</Text>
    </View>
  );
}

// NumberPickerWithCustom — preset chipy + free-text input pro vlastní hodnotu.
// Generický (použitý pro focus budget i min volume). {copy.custom} draft state,
// commit on blur/submit (jinak by každý keystroke triggerl refetch v
// useTopItems přes value v deps useMemo). useEffect resyncuje draft, když se
// value změní externě (chip tap).
function NumberPickerWithCustom({
  value,
  onChange,
  presets,
  unit,
  placeholder,
  scrollable,
  minValue = 0,
  maxValue,
}: {
  value: number;
  onChange: (n: number) => void;
  presets: ReadonlyArray<{ value: number; label: string }>;
  unit: string;
  placeholder: string;
  scrollable: boolean;
  minValue?: number;
  maxValue?: number;
}) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const [draft, setDraft] = useState<string>(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const cleaned = draft.replace(/[^0-9]/g, '');
    const parsed = parseInt(cleaned, 10);
    if (!Number.isFinite(parsed) || parsed < minValue) {
      // Invalid input — revertuj na poslední validní hodnotu.
      setDraft(String(value));
      return;
    }
    // Cap to backend max (focus 30k, volume 200) místo rejection — uživatel se
    // jen překlepl, lepší silent clamp než reset.
    const clamped =
      maxValue !== undefined ? Math.min(parsed, maxValue) : parsed;
    onChange(clamped);
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <FilterChips
        items={presets.map((p) => ({
          value: String(p.value),
          label: p.label,
        }))}
        active={String(value)}
        onChange={(v) => onChange(Number(v))}
        activeTone="frost"
        scrollable={scrollable}
      />
      <View style={styles.focusCustomRow}>
        <Text style={styles.focusCustomLabel}>{copy.custom}</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          maxLength={7}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={styles.focusCustomInput}
          selectTextOnFocus
          returnKeyType="done"
        />
        <Text style={styles.focusCustomUnit}>{unit}</Text>
      </View>
    </View>
  );
}

// Krátký souhrn filterů pro toggle button.
// Příklad: "T4–T6 · .0 · 10k focus · vol 1+ · no Caer".
function summarizeFilters(
  tiers: number[],
  enchants: number[],
  useFocus: boolean,
  focusBudget: number,
  minVolume: number,
  noCaerleon: boolean,
  language: LanguageCode,
): string {
  const sortedTiers = [...tiers].sort((a, b) => a - b);
  const tiersLabel = sortedTiers.length === 0
    ? '—'
    : sortedTiers.length === 1
      ? `T${sortedTiers[0]}`
      : `T${sortedTiers[0]}–T${sortedTiers[sortedTiers.length - 1]}`;

  const enchLabel = enchants.length === 0
    ? '—'
    : enchants.length === 1
      ? `.${enchants[0]}`
      : `.${enchants.length}×`;

  const focusLabel = useFocus
    ? `${(focusBudget / 1000).toFixed(0)}k focus`
    : language === 'en' ? 'no focus' : 'bez focusu';

  const volLabel = minVolume === 0
    ? language === 'en' ? 'vol all' : 'vol vse'
    : `vol ${minVolume}+`;

  // "no Caer" záměrně krátká verze — celý "Caerleon" je moc dlouhý a
  // summary se cpe do flex: 1 textu, který ořezává konec.
  const parts = [tiersLabel, enchLabel, focusLabel, volLabel];
  if (noCaerleon) parts.push('no Caer');

  return parts.join(' · ');
}

function FreshnessChip({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.fbChip}>
      <View style={[styles.fbDot, { backgroundColor: color }]} />
      <Text style={styles.fbLabel}>{label}</Text>
    </View>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <View style={styles.warningBlock}>
      <Text style={styles.warningText}>{text}</Text>
    </View>
  );
}

function ErrorBlock({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { language } = useLanguage();
  const copy = COPY[language];
  return (
    <GlowCard variant="rose" style={{ marginTop: spacing.lg }}>
      <Text style={styles.errorTitle}>{copy.analysisFailed}</Text>
      <Text style={styles.errorBody}>{error}</Text>
      <Text style={styles.errorHint} onPress={onRetry}>
        {copy.retry}
      </Text>
    </GlowCard>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────

function getId(item: TopItemRow): string {
  return (item.unique_name as string) ?? (item.item_id as string) ?? 'unknown';
}

function getKey(item: TopItemRow, fallbackIdx: number): string {
  return getId(item) !== 'unknown' ? getId(item) : `row-${fallbackIdx}`;
}

function getResourceBreakdown(item: TopItemRow): ResourceBreakdownRow[] {
  return Array.isArray(item.resource_breakdown) ? item.resource_breakdown : [];
}

function getHistoryPoints(item: TopItemRow): HistoryPoint[] {
  if (!Array.isArray(item.history)) return [];
  return item.history.filter(
    (point): point is HistoryPoint =>
      typeof point === 'object' &&
      point !== null &&
      typeof (point as HistoryPoint).date === 'string' &&
      typeof (point as HistoryPoint).avg_price === 'number' &&
      typeof (point as HistoryPoint).item_count === 'number',
  );
}

function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatShortHistoryDate(iso: string): string {
  if (!iso || iso.length < 10) return '-';
  const [, mm, dd] = iso.slice(0, 10).split('-');
  return mm && dd ? `${dd}.${mm}.` : iso.slice(0, 10);
}

function formatResourceName(id: string | null | undefined): string {
  if (!id) return 'Unknown resource';
  return id
    .replace(/^T(\d)_/, 'T$1 ')
    .replace(/_LEVEL(\d)@(\d)/g, '.$2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\bt(\d)\b/, 'T$1');
}

// ─── styles ────────────────────────────────────────────────────────────

let styles = makeTopItemsStyles(colors);

function makeTopItemsStyles(colors: AppColors) {
  return StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.bgCanvas },

  // iPhone
  topbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  themeToggle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  crest: {
    width: 32,
    height: 32,
    borderRadius: radius.sm + 1,
    backgroundColor: colors.arcaneDeep,
    alignItems: 'center',
    justifyContent: 'center',
    ...glow.arcane,
    shadowOpacity: 0.5,
  },
  crestText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  brandName: { color: colors.textPrimary, fontWeight: '700', letterSpacing: 0.4 },
  brandSub: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: 120, // místo pro tabbar
  },
  filtersRow: { paddingVertical: spacing.xs },
  searchButton: {
    minHeight: 48,
    borderRadius: radius.base,
    backgroundColor: colors.arcaneDeep,
    borderWidth: 1,
    borderColor: colors.arcane,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.base,
    ...glow.arcane,
  },
  searchButtonDisabled: {
    opacity: 0.62,
  },
  searchButtonPressed: {
    opacity: 0.82,
  },
  searchButtonText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 15,
  },
  searchDirtyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.amber,
  },
  searchIdleCard: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  searchIdleTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 16,
    textAlign: 'center',
  },
  searchIdleText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  advancedToggleText: {
    ...typography.captionStrong,
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  advancedToggleSummary: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    flex: 1,
    textAlign: 'right',
  },
  advancedPanel: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  focusToggleRow: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
  },
  focusSwitch: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.tagBg,
  },
  focusSwitchOn: {
    borderColor: 'rgba(103,232,249,0.35)',
    backgroundColor: 'rgba(103,232,249,0.10)',
  },
  focusSwitchText: {
    ...typography.captionStrong,
    color: colors.textSecondary,
    fontSize: 11,
  },
  focusSwitchTextOn: {
    color: colors.frost,
  },
  marketModeBox: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  marketModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  marketModeChip: {
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  marketModeChipActive: {
    borderColor: 'rgba(103,232,249,0.38)',
    backgroundColor: 'rgba(103,232,249,0.10)',
  },
  marketModeText: {
    ...typography.captionStrong,
    color: colors.textSecondary,
    fontSize: 11,
  },
  marketModeTextActive: {
    color: colors.frost,
  },
  marketModeHint: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 17,
  },
  focusCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  focusCustomLabel: {
    ...typography.captionStrong,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  focusCustomInput: {
    flex: 1,
    minWidth: 80,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface1,
    color: colors.textPrimary,
    ...typography.bodyStrong,
    fontVariant: ['tabular-nums'],
  },
  focusCustomUnit: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },

  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    padding: spacing.lg,
    ...typography.body,
  },
  loadingBlock: { padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  loadingHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 260,
  },
  loadingTimerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  loadingTimerText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  loadingTimerValue: {
    ...typography.kpiValue,
    color: colors.arcane,
    fontSize: 20,
    fontVariant: ['tabular-nums'],
  },

  freshnessRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    marginTop: spacing.base,
    marginHorizontal: spacing.xs,
  },
  fbChip: {
    flex: 1,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
  },
  fbDot: { width: 6, height: 6, borderRadius: 3 },
  fbLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  // iPad
  iPadGrid: { flex: 1, flexDirection: 'row' },
  iPadSide: {
    width: 280,
    borderRightWidth: 1,
    borderRightColor: colors.line,
  },
  iPadSideContent: {
    paddingHorizontal: spacing.base + 2,
    paddingVertical: spacing.xl + 4,
    paddingBottom: 120,
  },
  iPadMain: { flex: 1 },
  iPadMainContent: {
    paddingHorizontal: spacing.xl + 4,
    paddingVertical: spacing.xl + 4,
    paddingBottom: 120,
  },
  iPadDetail: {
    width: 360,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
  },
  iPadDetailContent: {
    paddingHorizontal: spacing.lg + 2,
    paddingVertical: spacing.xl + 4,
    paddingBottom: 120,
  },

  iPadH1: { ...typography.ipadH1, color: colors.textPrimary, marginBottom: spacing.xs },
  iPadSub: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl - 2,
  },
  navSection: {
    ...typography.captionStrong,
    color: colors.textMuted,
    marginTop: spacing.base + 4,
    marginBottom: spacing.sm,
  },

  kpiRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl - 2,
  },
  kpi: { flex: 1, padding: spacing.base - 2 },
  kpiLabel: {
    ...typography.captionStrong,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.0,
  },
  kpiValue: {
    ...typography.kpiValue,
    color: colors.textPrimary,
    fontSize: 22,
    marginTop: 4,
  },

  leaderboard: {
    backgroundColor: colors.surface1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  lbHead: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    backgroundColor: 'rgba(255,255,255,0.02)',
    gap: spacing.md,
  },
  lbHeadCell: {
    ...typography.captionStrong,
    color: colors.textMuted,
    fontSize: 10,
  },
  lbHeadRight: { width: 90, textAlign: 'right' },

  // detail
  detailEmpty: { paddingTop: spacing.lg },
  detailEye: {
    ...typography.eyebrow,
    color: colors.arcane,
    fontSize: 10,
    marginBottom: spacing.xs + 2,
  },
  detailTitle: {
    ...typography.detailH2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  detailTags: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    marginVertical: spacing.md,
    flexWrap: 'wrap',
  },
  detailHero: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  detailHeroCopy: {
    flex: 1,
  },
  detailUnique: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -2,
  },
  detailSummaryBand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.base,
    padding: spacing.md,
    marginBottom: spacing.base,
  },
  summaryCell: {
    flex: 1,
  },
  summaryLabel: {
    ...typography.captionStrong,
    color: colors.textMuted,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  summaryValue: {
    ...typography.kpiValue,
    color: colors.frost,
    fontSize: 19,
    marginTop: 2,
  },
  summaryValueAlt: {
    ...typography.kpiValue,
    color: colors.textPrimary,
    fontSize: 18,
    marginTop: 2,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    height: 34,
    backgroundColor: colors.line,
    marginHorizontal: spacing.sm,
  },
  selectedDetailCard: {
    marginBottom: spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2,6,23,0.58)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    maxHeight: '88%',
    backgroundColor: colors.bgCanvas,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.lineStrong,
    marginBottom: spacing.base,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  detailActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  detailActionTitle: {
    ...typography.captionStrong,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  detailCloseButton: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface1,
  },
  detailArt: {
    width: 108,
    height: 108,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(167,139,250,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    ...glow.arcane,
    shadowOpacity: 0.3,
  },
  detailArtImage: {
    width: 94,
    height: 94,
  },
  detailArtFallback: {
    fontSize: 48,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  kpiCell: {
    flexBasis: '48%',
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.base,
    padding: spacing.md,
  },
  resourcesBlock: {
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.base,
    padding: spacing.md,
    marginBottom: spacing.base,
  },
  resourcesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  resourceTotal: {
    ...typography.bodyStrong,
    color: colors.frost,
  },
  resourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  resourceIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  resourceIconImage: {
    width: 34,
    height: 34,
  },
  resourceIconFallback: {
    ...typography.bodyStrong,
    color: colors.arcane,
  },
  resourceDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  resourceNameWrap: {
    flex: 1,
  },
  resourceName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  resourceMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  resourceSubtotal: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  historyBlock: {
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.base,
    padding: spacing.md,
    marginBottom: spacing.base,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  historySubtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  historyPill: {
    minWidth: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  historyPillValue: {
    ...typography.bodyStrong,
    color: colors.frost,
  },
  historyPillLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 9,
  },
  volumeSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  volumeSummaryText: {
    ...typography.captionStrong,
    color: colors.textSecondary,
  },
  volumeChart: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.base,
    backgroundColor: colors.surface2,
  },
  volumeBarSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  volumeBar: {
    width: '72%',
    borderRadius: 3,
  },
  volumeBarSelected: {
    borderWidth: 1,
    borderColor: colors.textPrimary,
  },
  volumeSelectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  volumeEmpty: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.base,
    backgroundColor: colors.surface2,
  },
  tradeRoute: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },

  warningBlock: {
    marginTop: spacing.base,
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderRadius: radius.base,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.30)',
  },
  warningText: { ...typography.caption, color: colors.amber },

  errorTitle: {
    ...typography.heroTitle,
    color: colors.rose,
    marginBottom: spacing.xs,
  },
  errorBody: { ...typography.body, color: colors.textPrimary, marginBottom: spacing.sm },
  errorHint: { ...typography.caption, color: colors.frost, fontWeight: '700' },
  });
}
