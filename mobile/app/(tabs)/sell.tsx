import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchSellRecommendations } from '../../src/api/sell';
import { searchItems } from '../../src/api/items';
import {
  type ItemSearchResult,
  ROYAL_CITIES,
  type CityName,
  type SellItemInput,
  type SellItemResult,
  type SellResponse,
} from '../../src/api/types';
import { FilterChips, GlowCard, ThemeToggle } from '../../src/components';
import { useLanguage, type LanguageCode } from '../../src/i18n/LanguageProvider';
import { type AppColors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeProvider';
import { breakpoints, radius, spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { formatProfit, formatSilver, formatSilverCompact, shortCity } from '../../src/utils/format';

const CITY_FILTERS = ROYAL_CITIES.map<{ value: CityName; label: string }>((city) => ({
  value: city,
  label: city,
}));

const CATEGORY_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'UNKNOWN', label: 'Auto' },
  { value: 'BAG', label: 'Bag' },
  { value: 'CAPE', label: 'Cape' },
  { value: 'SWORD', label: 'Sword' },
  { value: 'BOW', label: 'Bow' },
  { value: 'PLATE_ARMOR', label: 'Plate' },
  { value: 'LEATHER_ARMOR', label: 'Leather' },
  { value: 'CLOTH_ARMOR', label: 'Cloth' },
  { value: 'METALBAR', label: 'Bars' },
  { value: 'PLANKS', label: 'Planks' },
  { value: 'LEATHER', label: 'Leather mat' },
  { value: 'CLOTH', label: 'Cloth mat' },
  { value: 'STONEBLOCK', label: 'Stone' },
];

const TIER_FILTERS: ReadonlyArray<{ value: string; label: string }> = [1, 2, 3, 4, 5, 6, 7, 8].map((tier) => ({
  value: String(tier),
  label: `T${tier}`,
}));

const COPY: Record<LanguageCode, {
  title: string;
  subtitle: string;
  from: string;
  includeBlackMarket: string;
  blackMarketTitle: string;
  blackMarketBody: string;
  blackMarketOn: string;
  blackMarketOff: string;
  blackMarketRoute: string;
  itemName: string;
  quantity: string;
  category: string;
  tier: string;
  addItem: string;
  remove: string;
  findBest: string;
  results: string;
  bestCity: string;
  netRevenue: string;
  sellPrice: string;
  priceSource: string;
  transport: string;
  volume: string;
  confidence: string;
  alternatives: string;
  empty: string;
  noSuggestions: string;
  backendUnavailable: string;
  noResultsTitle: string;
  noResultsBody: string;
}> = {
  cs: {
    title: 'Sell',
    subtitle: 'Zadej itemy z batohu a appka vybere nejlepší royal city po tax a transportu.',
    from: 'Kde teď jsi',
    includeBlackMarket: 'Včetně Black Marketu',
    blackMarketTitle: 'Caerleon Black Market',
    blackMarketBody: 'Bere buy order cenu z Black Marketu a počítá ji jako prodej v Caerleonu.',
    blackMarketOn: 'Zapnuto',
    blackMarketOff: 'Vypnuto',
    blackMarketRoute: 'Prodat přes Caerleon',
    itemName: 'Co máš v batohu',
    quantity: 'Kusy',
    category: 'Kategorie',
    tier: 'Tier',
    addItem: 'Přidat item',
    remove: 'Smazat',
    findBest: 'Najít nejlepší prodej',
    results: 'Doporučení',
    bestCity: 'Nejlepší město',
    netRevenue: 'Čistý výnos',
    sellPrice: 'Cena / kus',
    priceSource: 'Zdroj ceny',
    transport: 'Transport',
    volume: 'Volume',
    confidence: 'jistota',
    alternatives: 'Další města',
    empty: 'Začni psát název itemu, třeba bag, planks nebo sword.',
    noSuggestions: 'Nic nenalezeno',
    backendUnavailable: 'Backend nedostupný',
    noResultsTitle: 'Zatím žádné doporučení',
    noResultsBody: 'Přidej itemy z batohu a spusť hledání. Pokud je Black Market zapnutý, výsledky ho porovnají s royal cities.',
  },
  en: {
    title: 'Sell',
    subtitle: 'Enter your inventory and the app picks the best royal city after tax and transport.',
    from: 'Where you are',
    includeBlackMarket: 'Include Black Market',
    blackMarketTitle: 'Caerleon Black Market',
    blackMarketBody: 'Uses Black Market buy order prices and treats them as a Caerleon sale.',
    blackMarketOn: 'Enabled',
    blackMarketOff: 'Disabled',
    blackMarketRoute: 'Sell via Caerleon',
    itemName: 'What is in your inventory',
    quantity: 'Qty',
    category: 'Category',
    tier: 'Tier',
    addItem: 'Add item',
    remove: 'Remove',
    findBest: 'Find best sell city',
    results: 'Recommendations',
    bestCity: 'Best city',
    netRevenue: 'Net revenue',
    sellPrice: 'Price / item',
    priceSource: 'Price source',
    transport: 'Transport',
    volume: 'Volume',
    confidence: 'confidence',
    alternatives: 'Other cities',
    empty: 'Start typing an item name, for example bag, planks, or sword.',
    noSuggestions: 'No matches',
    backendUnavailable: 'Backend unavailable',
    noResultsTitle: 'No recommendation yet',
    noResultsBody: 'Add inventory items and run the search. When Black Market is enabled, results compare it against royal cities.',
  },
};

interface DraftItem {
  id: string;
  uniqueName: string;
  searchText: string;
  quantity: string;
  category: string;
  tier: string;
}

const firstDraft = (): DraftItem => ({
  id: `${Date.now()}-0`,
  uniqueName: 'T4_BAG',
  searchText: "Adept's Bag",
  quantity: '10',
  category: 'BAG',
  tier: '4',
});

export default function SellScreen() {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const { width } = useWindowDimensions();
  const copy = COPY[language];
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const isWide = width >= breakpoints.tablet;

  const [fromCity, setFromCity] = useState<CityName>('Bridgewatch');
  const [includeBlackMarket, setIncludeBlackMarket] = useState<boolean>(true);
  const [drafts, setDrafts] = useState<DraftItem[]>([firstDraft()]);
  const [data, setData] = useState<SellResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeTierDraftId, setActiveTierDraftId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ItemSearchResult[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState<boolean>(false);

  const activeDraft = drafts.find((draft) => draft.id === activeDraftId) ?? null;

  useEffect(() => {
    const query = activeDraft?.searchText.trim() ?? '';
    if (query.length < 2) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    let cancelled = false;
    setSuggestionsLoading(true);
    const timer = setTimeout(() => {
      searchItems(query)
        .then((result) => {
          if (!cancelled) setSuggestions(result.rows);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setSuggestionsLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeDraft?.searchText]);

  const validItems = useMemo<SellItemInput[]>(
    () =>
      drafts
        .map((draft) => ({
          unique_name: draft.uniqueName.trim().toUpperCase(),
          quantity: Math.max(1, Number(draft.quantity) || 0),
          category: draft.category,
          tier: Number(draft.tier) || null,
        }))
        .filter((item) => item.unique_name.length > 2 && item.quantity > 0),
    [drafts],
  );

  const updateDraft = (id: string, patch: Partial<DraftItem>) => {
    setDrafts((prev) => prev.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  };

  const addDraft = () => {
    setDrafts((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        uniqueName: '',
        searchText: '',
        quantity: '1',
        category: 'UNKNOWN',
        tier: '4',
      },
    ]);
  };

  const removeDraft = (id: string) => {
    setDrafts((prev) => (prev.length === 1 ? prev : prev.filter((draft) => draft.id !== id)));
  };

  const selectSuggestion = (draftId: string, item: ItemSearchResult) => {
    updateDraft(draftId, {
      uniqueName: item.unique_name,
      searchText: item.unique_name,
      category: item.category ?? 'UNKNOWN',
      tier: item.tier ? String(item.tier) : '4',
    });
    setActiveDraftId(null);
    setSuggestions([]);
  };

  const runSearch = async () => {
    if (!validItems.length) {
      setError(copy.empty);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSellRecommendations({
        from_city: fromCity,
        history_days: 7,
        include_black_market: includeBlackMarket,
        items: validItems,
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.canvas}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.h1}>{copy.title}</Text>
            <Text style={styles.sub}>{copy.subtitle}</Text>
          </View>
          <ThemeToggle />
        </View>

        <View style={[styles.mainGrid, isWide && styles.mainGridWide]}>
          <View style={[styles.controlsPane, isWide && styles.controlsPaneWide]}>
            <Text style={styles.label}>{copy.from}</Text>
            <FilterChips items={CITY_FILTERS} active={fromCity} onChange={setFromCity} activeTone="arcane" />

            <BlackMarketPanel
              copy={copy}
              enabled={includeBlackMarket}
              onToggle={() => setIncludeBlackMarket((value) => !value)}
              styles={styles}
            />

            <View style={styles.draftList}>
              {drafts.map((draft, index) => (
                <GlowCard key={draft.id} variant="neutral" style={styles.draftCard}>
                  <View style={styles.draftHeader}>
                    <Text style={styles.draftTitle}>#{index + 1}</Text>
                    {drafts.length > 1 ? (
                      <Pressable onPress={() => removeDraft(draft.id)} style={styles.iconButton}>
                        <Ionicons name="trash-outline" size={16} color={themeColors.rose} />
                        <Text style={styles.removeText}>{copy.remove}</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <Text style={styles.fieldLabel}>{copy.itemName}</Text>
                  <View style={styles.searchInputRow}>
                    <ItemThumb uniqueName={draft.uniqueName} styles={styles} />
                    <TextInput
                      autoCapitalize="words"
                      autoCorrect={false}
                      onChangeText={(value) => {
                        updateDraft(draft.id, {
                          searchText: value,
                          uniqueName: value.trim().toUpperCase(),
                        });
                        setActiveDraftId(draft.id);
                      }}
                      onFocus={() => setActiveDraftId(draft.id)}
                      placeholder="Bag, Planks, Sword..."
                      placeholderTextColor={themeColors.textMuted}
                      style={styles.searchInput}
                      value={draft.searchText}
                    />
                  </View>
                  {activeDraftId === draft.id ? (
                    <SuggestionList
                      copy={copy}
                      loading={suggestionsLoading}
                      onSelect={(item) => selectSuggestion(draft.id, item)}
                      styles={styles}
                      suggestions={suggestions}
                    />
                  ) : null}

                  <View style={styles.inlineFields}>
                    <View style={styles.qtyField}>
                      <Text style={styles.fieldLabel}>{copy.quantity}</Text>
                      <TextInput
                        keyboardType="number-pad"
                        onChangeText={(value) => updateDraft(draft.id, { quantity: value.replace(/[^0-9]/g, '') })}
                        placeholder="10"
                        placeholderTextColor={themeColors.textMuted}
                        style={styles.input}
                        value={draft.quantity}
                      />
                    </View>
                    <View style={styles.tierField}>
                      <Text style={styles.fieldLabel}>{copy.tier}</Text>
                      <TierSelect
                        active={activeTierDraftId === draft.id}
                        onChange={(value) => {
                          updateDraft(draft.id, { tier: value });
                          setActiveTierDraftId(null);
                        }}
                        onToggle={() => setActiveTierDraftId((current) => (current === draft.id ? null : draft.id))}
                        styles={styles}
                        value={draft.tier}
                      />
                    </View>
                  </View>

                  <Text style={styles.fieldLabel}>{copy.category}</Text>
                  <FilterChips
                    items={CATEGORY_FILTERS}
                    active={draft.category}
                    onChange={(value) => updateDraft(draft.id, { category: value })}
                    activeTone="arcane"
                  />
                </GlowCard>
              ))}
            </View>

            <View style={styles.actions}>
              <Pressable onPress={addDraft} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Ionicons name="add" size={17} color={themeColors.frost} />
                <Text style={styles.secondaryButtonText}>{copy.addItem}</Text>
              </Pressable>
              <Pressable onPress={runSearch} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                {loading ? (
                  <ActivityIndicator color={themeColors.bgCanvas} />
                ) : (
                  <>
                    <Ionicons name="search" size={17} color={themeColors.bgCanvas} />
                    <Text style={styles.primaryButtonText}>{copy.findBest}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          <View style={[styles.resultsPane, isWide && styles.resultsPaneWide]}>
            {error ? <ErrorBlock error={error} copy={copy} styles={styles} /> : null}

            {data ? (
              <View style={styles.results}>
                <Text style={styles.panelTitle}>{copy.results}</Text>
                {data.rows.map((row) => (
                  <SellResultCard key={row.unique_name} row={row} copy={copy} styles={styles} />
                ))}
              </View>
            ) : !error ? (
              <EmptyResultsCard copy={copy} styles={styles} />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BlackMarketPanel({
  copy,
  enabled,
  onToggle,
  styles,
}: {
  copy: (typeof COPY)[LanguageCode];
  enabled: boolean;
  onToggle: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.blackMarketPanel,
        enabled && styles.blackMarketPanelOn,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.blackMarketIcon}>
        <Ionicons name="skull-outline" size={22} color={styles.activeIconColor.color} />
      </View>
      <View style={styles.blackMarketBody}>
        <View style={styles.blackMarketHeader}>
          <Text style={styles.blackMarketTitle}>{copy.blackMarketTitle}</Text>
          <View style={[styles.blackMarketStatus, enabled && styles.blackMarketStatusOn]}>
            <Ionicons
              name={enabled ? 'checkmark-circle' : 'remove-circle-outline'}
              size={14}
              color={enabled ? styles.activeIconColor.color : styles.mutedIconColor.color}
            />
            <Text style={[styles.blackMarketStatusText, enabled && styles.blackMarketStatusTextOn]}>
              {enabled ? copy.blackMarketOn : copy.blackMarketOff}
            </Text>
          </View>
        </View>
        <Text style={styles.blackMarketDescription}>{copy.blackMarketBody}</Text>
        <View style={styles.blackMarketRouteRow}>
          <Text style={styles.blackMarketRoute}>{copy.blackMarketRoute}</Text>
          <Ionicons name="arrow-forward" size={14} color={styles.activeIconColor.color} />
          <Text style={styles.blackMarketRoute}>Black Market</Text>
        </View>
      </View>
    </Pressable>
  );
}

function SellResultCard({
  row,
  copy,
  styles,
}: {
  row: SellItemResult;
  copy: (typeof COPY)[LanguageCode];
  styles: ReturnType<typeof createStyles>;
}) {
  const best = row.options[0];
  const isBlackMarket = best?.price_source === 'black_market_buy_max';
  return (
    <GlowCard variant={isBlackMarket ? 'arcane' : best ? 'frost' : 'rose'} style={styles.resultCard}>
      <View style={styles.resultTop}>
        <ItemThumb uniqueName={row.unique_name} styles={styles} />
        <View style={styles.resultBody}>
          <Text style={styles.resultTitle}>{row.unique_name}</Text>
          <Text style={styles.resultMeta}>{row.quantity} ks</Text>
        </View>
        {best ? (
          <View style={[styles.bestCityPill, isBlackMarket && styles.bestCityPillBlackMarket]}>
            <Text style={styles.bestCityLabel}>{copy.bestCity}</Text>
            <Text style={styles.bestCity}>{best.city}</Text>
          </View>
        ) : null}
      </View>

      {best ? (
        <>
          {isBlackMarket ? (
            <View style={styles.blackMarketResultBadge}>
              <Ionicons name="skull-outline" size={15} color={styles.activeIconColor.color} />
              <Text style={styles.blackMarketResultBadgeText}>Black Market buy order</Text>
            </View>
          ) : null}
          <View style={styles.heroRevenueRow}>
            <Text style={styles.heroRevenue}>{formatProfit(row.best_net_revenue)}</Text>
            <Text style={styles.heroRevenueUnit}>{copy.netRevenue}</Text>
          </View>
          <View style={styles.kpiGrid}>
            <Kpi label={copy.sellPrice} value={formatSilver(best.sell_min)} styles={styles} />
            <Kpi label={copy.priceSource} value={priceSourceLabel(best.price_source)} styles={styles} />
            <Kpi label={copy.transport} value={formatSilver(best.transport_fee)} styles={styles} />
            <Kpi label={copy.volume} value={`${best.avg_daily_volume}/den`} styles={styles} />
            <Kpi label={copy.confidence} value={`${best.confidence_score}%`} styles={styles} />
          </View>
          <Text style={styles.altTitle}>{copy.alternatives}</Text>
          {row.options.slice(1, 4).map((option) => (
            <View key={option.city} style={styles.altRow}>
              <Text style={styles.altCity}>{shortCity(option.city)}</Text>
              <Text style={styles.altNet}>{formatSilverCompact(option.net_revenue)}</Text>
              <Text style={styles.altFee}>-{formatSilverCompact(option.transport_fee)}</Text>
            </View>
          ))}
        </>
      ) : (
        <Text style={styles.warning}>{row.warning}</Text>
      )}
    </GlowCard>
  );
}

function EmptyResultsCard({
  copy,
  styles,
}: {
  copy: (typeof COPY)[LanguageCode];
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <GlowCard variant="neutral" style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Ionicons name="analytics-outline" size={24} color={styles.activeIconColor.color} />
      </View>
      <Text style={styles.emptyTitle}>{copy.noResultsTitle}</Text>
      <Text style={styles.emptyBody}>{copy.noResultsBody}</Text>
    </GlowCard>
  );
}

function TierSelect({
  active,
  onChange,
  onToggle,
  styles,
  value,
}: {
  active: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
  styles: ReturnType<typeof createStyles>;
  value: string;
}) {
  const selected = TIER_FILTERS.find((tier) => tier.value === value) ?? { value: '4', label: 'T4' };
  return (
    <View style={styles.tierSelectWrap}>
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.tierSelect, pressed && styles.pressed]}>
        <Text style={styles.tierSelectText}>{selected.label}</Text>
        <Ionicons name={active ? 'chevron-up' : 'chevron-down'} size={16} color={styles.activeIconColor.color} />
      </Pressable>
      {active ? (
        <View style={styles.tierMenu}>
          {TIER_FILTERS.map((tier) => (
            <Pressable
              key={tier.value}
              onPress={() => onChange(tier.value)}
              style={({ pressed }) => [
                styles.tierOption,
                tier.value === value && styles.tierOptionActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.tierOptionText, tier.value === value && styles.tierOptionTextActive]}>
                {tier.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SuggestionList({
  copy,
  loading,
  onSelect,
  styles,
  suggestions,
}: {
  copy: (typeof COPY)[LanguageCode];
  loading: boolean;
  onSelect: (item: ItemSearchResult) => void;
  styles: ReturnType<typeof createStyles>;
  suggestions: ItemSearchResult[];
}) {
  if (loading) {
    return (
      <View style={styles.suggestionBox}>
        <ActivityIndicator color={styles.activeIconColor.color} />
      </View>
    );
  }
  if (!suggestions.length) {
    return (
      <View style={styles.suggestionBox}>
        <Text style={styles.noSuggestions}>{copy.noSuggestions}</Text>
      </View>
    );
  }
  return (
    <View style={styles.suggestionBox}>
      {suggestions.slice(0, 6).map((item, index) => (
        <Pressable
          key={item.unique_name}
          onPress={() => onSelect(item)}
          style={({ pressed }) => [
            styles.suggestionRow,
            index === suggestions.length - 1 ? null : styles.suggestionDivider,
            pressed && styles.pressed,
          ]}
        >
          <ItemThumb uniqueName={item.unique_name} styles={styles} />
          <View style={styles.suggestionBody}>
            <Text style={styles.suggestionName}>{item.unique_name}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function ItemThumb({ uniqueName, styles }: { uniqueName?: string; styles: ReturnType<typeof createStyles> }) {
  const canRender = Boolean(uniqueName && uniqueName.length > 2 && uniqueName.includes('_'));
  if (!canRender) {
    return (
      <View style={styles.itemThumbFallback}>
        <Ionicons name="cube-outline" size={17} color={styles.activeIconColor.color} />
      </View>
    );
  }
  return (
    <View style={styles.itemThumb}>
      <Image
        resizeMode="contain"
        source={{ uri: `https://render.albiononline.com/v1/item/${uniqueName}.png` }}
        style={styles.itemThumbImage}
      />
    </View>
  );
}

function Kpi({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.kpiCell}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

function priceSourceLabel(source: string | undefined): string {
  if (source === 'black_market_buy_max') return 'BM buy order';
  return 'sell min';
}

function ErrorBlock({
  error,
  copy,
  styles,
}: {
  error: string;
  copy: (typeof COPY)[LanguageCode];
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <GlowCard variant="rose" style={styles.errorCard}>
      <Text style={styles.errorTitle}>{copy.backendUnavailable}</Text>
      <Text style={styles.errorBody}>{error}</Text>
    </GlowCard>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    canvas: { flex: 1, backgroundColor: colors.bgCanvas },
    content: { padding: spacing.base, paddingBottom: 120 },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.base,
    },
    headerCopy: { flex: 1 },
    h1: { ...typography.ipadH1, color: colors.textPrimary, fontSize: 28 },
    sub: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
    label: {
      ...typography.captionStrong,
      color: colors.textMuted,
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
    },
    mainGrid: {
      gap: spacing.lg,
    },
    mainGridWide: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    controlsPane: {
      gap: 0,
    },
    controlsPaneWide: {
      flexBasis: 440,
      flexShrink: 0,
    },
    resultsPane: {
      gap: spacing.md,
    },
    resultsPaneWide: {
      flex: 1,
      minWidth: 0,
      paddingTop: spacing.lg,
    },
    blackMarketPanel: {
      marginTop: spacing.md,
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.lineStrong,
      backgroundColor: colors.surface1,
    },
    blackMarketPanelOn: {
      borderColor: colors.arcaneGlow,
      backgroundColor: colors.arcaneSoft,
    },
    blackMarketIcon: {
      width: 42,
      height: 42,
      borderRadius: radius.base,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.arcaneGlow,
    },
    blackMarketBody: { flex: 1, minWidth: 0, gap: spacing.xs },
    blackMarketHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    blackMarketTitle: { ...typography.bodyStrong, color: colors.textPrimary },
    blackMarketDescription: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
    blackMarketStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: colors.tagBg,
      borderWidth: 1,
      borderColor: colors.line,
    },
    blackMarketStatusOn: {
      backgroundColor: colors.frostSoft,
      borderColor: colors.frostGlow,
    },
    blackMarketStatusText: { ...typography.captionStrong, color: colors.textMuted },
    blackMarketStatusTextOn: { color: colors.frost },
    blackMarketRouteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flexWrap: 'wrap',
      marginTop: spacing.xs,
    },
    blackMarketRoute: { ...typography.captionStrong, color: colors.arcane },
    draftList: { gap: spacing.md, marginTop: spacing.lg },
    draftCard: { gap: spacing.sm },
    draftHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    draftTitle: { ...typography.heroTitle, color: colors.textPrimary },
    iconButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    removeText: { ...typography.captionStrong, color: colors.rose },
    fieldLabel: { ...typography.captionStrong, color: colors.textMuted, marginTop: spacing.sm },
    input: {
      minHeight: 42,
      borderRadius: radius.base,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface2,
      color: colors.textPrimary,
      paddingHorizontal: spacing.md,
      ...typography.bodyStrong,
    },
    searchInputRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: radius.base,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface2,
      paddingHorizontal: spacing.sm,
    },
    searchInput: {
      flex: 1,
      minHeight: 46,
      color: colors.textPrimary,
      ...typography.bodyStrong,
    },
    itemThumb: {
      width: 38,
      height: 38,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface1,
      overflow: 'hidden',
    },
    itemThumbFallback: {
      width: 38,
      height: 38,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.arcaneSoft,
    },
    itemThumbImage: { width: 36, height: 36 },
    suggestionBox: {
      marginTop: spacing.sm,
      borderRadius: radius.base,
      borderWidth: 1,
      borderColor: colors.lineStrong,
      backgroundColor: colors.surface2,
      overflow: 'hidden',
      minHeight: 44,
      justifyContent: 'center',
    },
    suggestionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    suggestionDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
    suggestionBody: { flex: 1, minWidth: 0 },
    suggestionName: { ...typography.bodyStrong, color: colors.textPrimary },
    noSuggestions: { ...typography.captionStrong, color: colors.textMuted, textAlign: 'center' },
    inlineFields: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
    qtyField: { width: 94 },
    tierField: { flex: 1 },
    tierSelectWrap: { position: 'relative' },
    tierSelect: {
      minHeight: 42,
      borderRadius: radius.base,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface2,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    tierSelectText: { ...typography.bodyStrong, color: colors.textPrimary },
    tierMenu: {
      marginTop: spacing.xs,
      borderRadius: radius.base,
      borderWidth: 1,
      borderColor: colors.lineStrong,
      backgroundColor: colors.surface2,
      overflow: 'hidden',
      zIndex: 10,
    },
    tierOption: {
      minHeight: 36,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    tierOptionActive: { backgroundColor: colors.frostSoft },
    tierOptionText: { ...typography.bodyStrong, color: colors.textSecondary },
    tierOptionTextActive: { color: colors.frost },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    secondaryButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: radius.base,
      borderWidth: 1,
      borderColor: colors.frostGlow,
      backgroundColor: colors.frostSoft,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    secondaryButtonText: { ...typography.bodyStrong, color: colors.frost },
    primaryButton: {
      flex: 1.4,
      minHeight: 46,
      borderRadius: radius.base,
      backgroundColor: colors.frost,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    primaryButtonText: { ...typography.bodyStrong, color: colors.bgCanvas },
    results: { marginTop: spacing.lg, gap: spacing.md },
    panelTitle: { ...typography.heroTitle, color: colors.textPrimary },
    resultCard: { gap: spacing.md },
    resultTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    itemIcon: {
      width: 42,
      height: 42,
      borderRadius: radius.base,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.arcaneSoft,
    },
    activeIconColor: { color: colors.arcane },
    mutedIconColor: { color: colors.textMuted },
    resultBody: { flex: 1, minWidth: 0 },
    resultTitle: { ...typography.bodyStrong, color: colors.textPrimary },
    resultMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    bestCityPill: {
      alignItems: 'flex-end',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.base,
      backgroundColor: colors.frostSoft,
      borderWidth: 1,
      borderColor: colors.frostGlow,
    },
    bestCityPillBlackMarket: {
      backgroundColor: colors.arcaneSoft,
      borderColor: colors.arcaneGlow,
    },
    bestCityLabel: { ...typography.caption, color: colors.textMuted },
    bestCity: { ...typography.captionStrong, color: colors.frost },
    blackMarketResultBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.arcaneGlow,
      backgroundColor: colors.arcaneSoft,
    },
    blackMarketResultBadgeText: { ...typography.captionStrong, color: colors.arcane },
    heroRevenueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
    heroRevenue: { ...typography.heroNumber, color: colors.frost, fontSize: 32 },
    heroRevenueUnit: { ...typography.captionStrong, color: colors.textSecondary },
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    kpiCell: {
      flexBasis: '48%',
      borderRadius: radius.base,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.sm,
    },
    kpiLabel: { ...typography.caption, color: colors.textMuted },
    kpiValue: { ...typography.bodyStrong, color: colors.textPrimary, marginTop: 2 },
    altTitle: { ...typography.captionStrong, color: colors.textMuted, marginTop: spacing.xs },
    altRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    altCity: { ...typography.bodyStrong, color: colors.textPrimary, flex: 1 },
    altNet: { ...typography.captionStrong, color: colors.frost, width: 76, textAlign: 'right' },
    altFee: { ...typography.caption, color: colors.textMuted, width: 62, textAlign: 'right' },
    warning: { ...typography.body, color: colors.amber },
    errorCard: { marginTop: spacing.lg },
    errorTitle: { ...typography.heroTitle, color: colors.rose, marginBottom: spacing.xs },
    errorBody: { ...typography.body, color: colors.textPrimary },
    emptyCard: {
      minHeight: 260,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    emptyIcon: {
      width: 54,
      height: 54,
      borderRadius: radius.xl,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.arcaneGlow,
      backgroundColor: colors.arcaneSoft,
    },
    emptyTitle: { ...typography.heroTitle, color: colors.textPrimary, textAlign: 'center' },
    emptyBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center', maxWidth: 420 },
    pressed: { opacity: 0.72 },
  });
}
