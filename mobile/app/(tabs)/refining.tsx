import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchRefining } from '../../src/api/refining';
import type { RefiningResponse, RefiningRow } from '../../src/api/types';
import { FilterChips, GlowCard, MultiFilterChips, SectionHeader, ThemeToggle } from '../../src/components';
import { useLanguage, type LanguageCode } from '../../src/i18n/LanguageProvider';
import type { AppColors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius, spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { formatPercent, formatProfit, formatRoute, formatSilver, formatSilverCompact, shortCity } from '../../src/utils/format';

type MaterialFilter = 'ALL' | 'METALBAR' | 'PLANKS' | 'LEATHER' | 'CLOTH' | 'STONEBLOCK';
type CityFilter = 'auto' | 'Fort Sterling' | 'Bridgewatch' | 'Lymhurst' | 'Martlock' | 'Thetford' | 'Caerleon';
type PriceMode = 'current' | 'average';
type ReturnRatePreset = 'bonus_city' | 'royal_city' | 'royal_island' | 'royal_island_bonus';

const TIER_FILTERS: ReadonlyArray<{ value: number; label: string }> = [4, 5, 6, 7, 8].map((tier) => ({
  value: tier,
  label: `T${tier}`,
}));

const MATERIAL_FILTERS: ReadonlyArray<{ value: MaterialFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'METALBAR', label: 'Ore' },
  { value: 'PLANKS', label: 'Wood' },
  { value: 'LEATHER', label: 'Hide' },
  { value: 'CLOTH', label: 'Fiber' },
  { value: 'STONEBLOCK', label: 'Stone' },
];

const BUDGET_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 250_000, label: '250k' },
  { value: 1_000_000, label: '1m' },
  { value: 5_000_000, label: '5m' },
  { value: 10_000_000, label: '10m' },
];

const VOLUME_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: 'Any' },
  { value: 5, label: '5+' },
  { value: 20, label: '20+' },
  { value: 50, label: '50+' },
];

const USAGE_FEE_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: '0%' },
  { value: 1.5, label: '1.5%' },
  { value: 3, label: '3%' },
];

const MARKET_TAX_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: '0%' },
  { value: 4, label: '4%' },
  { value: 6.5, label: '6.5%' },
];

const CITY_FILTERS: ReadonlyArray<{ value: CityFilter; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'Bridgewatch', label: 'BR' },
  { value: 'Fort Sterling', label: 'FS' },
  { value: 'Lymhurst', label: 'LY' },
  { value: 'Martlock', label: 'MT' },
  { value: 'Thetford', label: 'TF' },
  { value: 'Caerleon', label: 'CA' },
];

const PRICE_MODE_FILTERS: ReadonlyArray<{ value: PriceMode; label: string }> = [
  { value: 'current', label: 'Current' },
  { value: 'average', label: 'Average' },
];

const PERIOD_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: '1d' },
  { value: 3, label: '3d' },
  { value: 7, label: '1w' },
  { value: 30, label: '1m' },
];

const RETURN_RATE_FILTERS: ReadonlyArray<{ value: ReturnRatePreset; label: string }> = [
  { value: 'bonus_city', label: 'Bonus city' },
  { value: 'royal_city', label: 'Royal' },
  { value: 'royal_island', label: 'Island' },
  { value: 'royal_island_bonus', label: 'Island bonus' },
];

const STALE_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: 'Any' },
  { value: 6, label: '6h' },
  { value: 24, label: '24h' },
  { value: 72, label: '3d' },
];

const T7_OX_LOAD_KG = 2_100;
const DEFAULT_INPUT_WEIGHT_KG = 2.2;
const DEFAULT_OUTPUT_WEIGHT_KG = 0.2;

const compareBudgetPlans = (a: RefiningRow, b: RefiningRow): number =>
  budgetProfit(b) - budgetProfit(a) ||
  perRunProfit(b) - perRunProfit(a) ||
  routeProfile(a.buy_city, a.refine_city, a.sell_city).steps -
    routeProfile(b.buy_city, b.refine_city, b.sell_city).steps ||
  (b.roi_pct ?? 0) - (a.roi_pct ?? 0);

const COPY: Record<LanguageCode, {
  title: string;
  subtitle: string;
  settings: string;
  settingsMeta: string;
  budget: string;
  material: string;
  tiers: string;
  buyCity: string;
  refineCity: string;
  dataMode: string;
  period: string;
  usageFee: string;
  marketTax: string;
  advanced: string;
  returnPreset: string;
  profitableOnly: string;
  maxStale: string;
  minVolume: string;
  search: string;
  searching: string;
  results: string;
  resultMeta: (count: number, budget: number) => string;
  startTitle: string;
  startBody: string;
  empty: string;
  backendUnavailable: string;
  bestPick: string;
  rankedByBudget: string;
  costPerRun: string;
  avgShopCost: string;
  maxBuyPrice: string;
  refineAndSell: string;
  profitPerRun: string;
  runs: string;
  budgetProfit: string;
  planProfit: string;
  refinedPieces: string;
  shoppingList: string;
  totalSpend: string;
  oxTrips: string;
  oneRefine: string;
  neededForOne: string;
  unitProfit: string;
  load: string;
  budgetCap: string;
  route: string;
  routeEase: string;
  sameCity: string;
  shortRoute: string;
  mediumRoute: string;
  longRoute: string;
  profitable: string;
  losing: string;
  returnRate: string;
  sell: string;
  volumeDay: string;
  roi: string;
  confidence: string;
  custom: string;
  silver: string;
  bonusCity: string;
  sellOptions: string;
  perRun: string;
  noFocus: string;
  materialFallback: string;
}> = {
  cs: {
    title: 'Refining',
    subtitle: 'Zadej denní silver budget, nastav search a spusť výpočet až tlačítkem.',
    settings: 'Nastavení searche',
    settingsMeta: 'materiál, trasa, data a budget',
    budget: 'Denní budget',
    material: 'Materiál',
    tiers: 'Tiery',
    buyCity: 'Buy city',
    refineCity: 'Refining city',
    dataMode: 'Data',
    period: 'Perioda',
    usageFee: 'Usage fee',
    marketTax: 'Market tax',
    advanced: 'Advanced',
    returnPreset: 'Return rate',
    profitableOnly: 'Jen profitabilní',
    maxStale: 'Max stáří cen',
    minVolume: 'Min. volume / den',
    search: 'Search',
    searching: 'Počítám',
    results: 'Výsledky',
    resultMeta: (count, budget) => `${count} možností pro ${formatSilverCompact(budget)} budget`,
    startTitle: 'Zatím nic nepočítám',
    startBody: 'Uprav nastavení, klepni Search a dostaneš pořadí od nejlepšího po nejhorší podle denního budgetu.',
    empty: 'Žádné refining příležitosti pro tenhle search.',
    backendUnavailable: 'Backend nedostupný',
    bestPick: 'Nejlepší volba pro budget',
    rankedByBudget: 'bez focusu, bonus city return',
    costPerRun: 'náklad / run',
    avgShopCost: 'shop fee',
    maxBuyPrice: 'max buy raw',
    refineAndSell: 'refine/prodej',
    profitPerRun: 'profit / run',
    runs: 'runů',
    budgetProfit: 'profit pro budget',
    planProfit: 'profit pro tvůj budget',
    refinedPieces: 'vyrefinuješ',
    shoppingList: 'Nákupní seznam',
    totalSpend: 'utraceno',
    oxTrips: 'T7 ox tripů',
    oneRefine: '1 refine kus',
    neededForOne: 'potřebuješ / ks',
    unitProfit: 'profit / ks',
    load: 'náklad',
    budgetCap: 'budget limit',
    route: 'trasa',
    routeEase: 'komfort trasy',
    sameCity: 'stejné město',
    shortRoute: 'krátká trasa',
    mediumRoute: 'střední trasa',
    longRoute: 'dlouhá trasa',
    profitable: 'profitabilní',
    losing: 'ztrátové',
    returnRate: 'return',
    sell: 'prodej',
    volumeDay: 'vol',
    roi: 'ROI',
    confidence: 'jistota',
    custom: 'Vlastní',
    silver: 'silver',
    bonusCity: 'bonus city',
    sellOptions: 'Alternativy nákupu',
    perRun: 'run',
    noFocus: 'bez focusu',
    materialFallback: 'Materiál',
  },
  en: {
    title: 'Refining',
    subtitle: 'Set a daily silver budget, tune search settings, then run the calculation on demand.',
    settings: 'Search settings',
    settingsMeta: 'material, route, data, and budget',
    budget: 'Daily budget',
    material: 'Material',
    tiers: 'Tiers',
    buyCity: 'Buy city',
    refineCity: 'Refining city',
    dataMode: 'Data',
    period: 'Period',
    usageFee: 'Usage fee',
    marketTax: 'Market tax',
    advanced: 'Advanced',
    returnPreset: 'Return rate',
    profitableOnly: 'Profitable only',
    maxStale: 'Max price age',
    minVolume: 'Min. volume / day',
    search: 'Search',
    searching: 'Searching',
    results: 'Results',
    resultMeta: (count, budget) => `${count} options for ${formatSilverCompact(budget)} budget`,
    startTitle: 'No calculation yet',
    startBody: 'Adjust settings, tap Search, and get results ranked best to worst by daily budget.',
    empty: 'No refining opportunities for this search.',
    backendUnavailable: 'Backend unavailable',
    bestPick: 'Best pick for budget',
    rankedByBudget: 'no focus, bonus city return',
    costPerRun: 'cost / run',
    avgShopCost: 'shop fee',
    maxBuyPrice: 'max buy raw',
    refineAndSell: 'refine/sell',
    profitPerRun: 'profit / run',
    runs: 'runs',
    budgetProfit: 'budget profit',
    planProfit: 'profit for your budget',
    refinedPieces: 'refined output',
    shoppingList: 'Shopping list',
    totalSpend: 'spent',
    oxTrips: 'T7 ox trips',
    oneRefine: '1 refined piece',
    neededForOne: 'needed / pc',
    unitProfit: 'profit / pc',
    load: 'load',
    budgetCap: 'budget cap',
    route: 'route',
    routeEase: 'route ease',
    sameCity: 'same city',
    shortRoute: 'short route',
    mediumRoute: 'medium route',
    longRoute: 'long route',
    profitable: 'profitable',
    losing: 'losing',
    returnRate: 'return',
    sell: 'sell',
    volumeDay: 'vol',
    roi: 'ROI',
    confidence: 'confidence',
    custom: 'Custom',
    silver: 'silver',
    bonusCity: 'bonus city',
    sellOptions: 'Buy alternatives',
    perRun: 'run',
    noFocus: 'no focus',
    materialFallback: 'Material',
  },
};

export default function RefiningScreen() {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const copy = COPY[language];
  const styles = useMemo(() => makeRefiningStyles(themeColors), [themeColors]);

  const [settingsOpen, setSettingsOpen] = useState(true);
  const [budget, setBudget] = useState<number>(1_000_000);
  const [tiers, setTiers] = useState<number[]>([4, 5, 6]);
  const [material, setMaterial] = useState<MaterialFilter>('ALL');
  const [buyCity, setBuyCity] = useState<CityFilter>('auto');
  const [refineCity, setRefineCity] = useState<CityFilter>('auto');
  const [priceMode, setPriceMode] = useState<PriceMode>('current');
  const [historyDays, setHistoryDays] = useState<number>(7);
  const [usageFeePct, setUsageFeePct] = useState<number>(1.5);
  const [marketTaxPct, setMarketTaxPct] = useState<number>(4);
  const [returnRatePreset, setReturnRatePreset] = useState<ReturnRatePreset>('bonus_city');
  const [profitableOnly, setProfitableOnly] = useState<boolean>(false);
  const [maxStaleHours, setMaxStaleHours] = useState<number>(0);
  const [minVolume, setMinVolume] = useState<number>(0);
  const [data, setData] = useState<RefiningResponse | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  const rows = data?.rows ?? [];
  const rankedRows = useMemo(() => bestRowsByMaterialTier(rows).sort(compareBudgetPlans), [rows]);
  const best = rankedRows[0] ?? null;
  const profitableCount = rankedRows.filter((row) => budgetProfit(row) > 0).length;

  const toggleTier = (tier: number) => {
    setTiers((prev) =>
      prev.includes(tier) ? prev.filter((value) => value !== tier) : [...prev, tier],
    );
  };

  const runSearch = async () => {
    setHasSearched(true);
    setLoading(true);
    setError(null);
    setExpandedRowKey(null);

    try {
      const res = await fetchRefining({
        tiers: [...tiers].sort((a, b) => a - b),
        focus_budget: 0,
        investment_budget: budget,
        material: material === 'ALL' ? null : material,
        buy_city: buyCity,
        refine_city: refineCity,
        sell_city: 'auto',
        history_days: historyDays,
        price_mode: priceMode,
        usage_fee_pct: usageFeePct,
        market_tax_pct: marketTaxPct,
        return_rate_preset: returnRatePreset,
        custom_return_rate_pct: null,
        profitable_only: profitableOnly,
        max_stale_hours: maxStaleHours,
        min_volume: minVolume,
        bonus_only: true,
        activity_bonus_categories: [],
      });
      setData(res);
      setSettingsOpen(false);
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

        <View style={styles.searchPanel}>
          <Pressable
            onPress={() => setSettingsOpen((value) => !value)}
            style={({ pressed }) => [styles.settingsHeader, pressed && styles.pressed]}
          >
            <View style={styles.settingsTitleWrap}>
              <Text style={styles.settingsTitle}>{copy.settings}</Text>
              <Text style={styles.settingsMeta}>
                {materialLabel(material)} · {cityLabel(buyCity)} {'->'} {cityLabel(refineCity)} · {formatSilverCompact(budget)}
              </Text>
            </View>
            <Ionicons
              name={settingsOpen ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={themeColors.textSecondary}
            />
          </Pressable>

          {settingsOpen ? (
            <View style={styles.settingsBody}>
              <Text style={styles.label}>{copy.budget}</Text>
              <NumberPickerWithCustom
                value={budget}
                onChange={setBudget}
                presets={BUDGET_PRESETS}
                unit={copy.silver}
                placeholder="1000000"
                minValue={1}
                maxValue={1_000_000_000}
              />

              <Text style={styles.label}>{copy.material}</Text>
              <FilterChips
                items={MATERIAL_FILTERS}
                active={material}
                onChange={setMaterial}
                activeTone="arcane"
              />

              <Text style={styles.label}>{copy.tiers}</Text>
              <MultiFilterChips
                items={TIER_FILTERS}
                active={tiers}
                onToggle={toggleTier}
                activeTone="arcane"
              />

              <Text style={styles.label}>{copy.buyCity}</Text>
              <FilterChips
                items={CITY_FILTERS}
                active={buyCity}
                onChange={setBuyCity}
                activeTone="arcane"
              />

              <Text style={styles.label}>{copy.refineCity}</Text>
              <FilterChips
                items={CITY_FILTERS}
                active={refineCity}
                onChange={setRefineCity}
                activeTone="arcane"
              />

              <View style={styles.settingPair}>
                <View style={styles.settingColumn}>
                  <Text style={styles.label}>{copy.dataMode}</Text>
                  <FilterChips
                    items={PRICE_MODE_FILTERS}
                    active={priceMode}
                    onChange={setPriceMode}
                    activeTone="arcane"
                  />
                </View>
                <View style={styles.settingColumn}>
                  <Text style={styles.label}>{copy.period}</Text>
                  <FilterChips
                    items={PERIOD_PRESETS.map((preset) => ({
                      value: String(preset.value),
                      label: preset.label,
                    }))}
                    active={String(historyDays)}
                    onChange={(next) => setHistoryDays(Number(next))}
                    activeTone="arcane"
                  />
                </View>
              </View>

              <View style={styles.settingPair}>
                <View style={styles.settingColumn}>
                  <Text style={styles.label}>{copy.usageFee}</Text>
                  <NumberPickerWithCustom
                    value={usageFeePct}
                    onChange={setUsageFeePct}
                    presets={USAGE_FEE_PRESETS}
                    unit="%"
                    placeholder="1.5"
                    maxValue={100}
                    decimal
                  />
                </View>
                <View style={styles.settingColumn}>
                  <Text style={styles.label}>{copy.marketTax}</Text>
                  <NumberPickerWithCustom
                    value={marketTaxPct}
                    onChange={setMarketTaxPct}
                    presets={MARKET_TAX_PRESETS}
                    unit="%"
                    placeholder="4"
                    maxValue={100}
                    decimal
                  />
                </View>
              </View>

              <Text style={styles.sectionLabel}>{copy.advanced}</Text>

              <Text style={styles.label}>{copy.returnPreset}</Text>
              <FilterChips
                items={RETURN_RATE_FILTERS}
                active={returnRatePreset}
                onChange={setReturnRatePreset}
                activeTone="arcane"
              />

              <View style={styles.settingPair}>
                <View style={styles.settingColumn}>
                  <Text style={styles.label}>{copy.profitableOnly}</Text>
                  <FilterChips
                    items={[
                      { value: 'false', label: 'All' },
                      { value: 'true', label: copy.profitableOnly },
                    ]}
                    active={profitableOnly ? 'true' : 'false'}
                    onChange={(next) => setProfitableOnly(next === 'true')}
                    activeTone="arcane"
                  />
                </View>
                <View style={styles.settingColumn}>
                  <Text style={styles.label}>{copy.maxStale}</Text>
                  <FilterChips
                    items={STALE_PRESETS.map((preset) => ({
                      value: String(preset.value),
                      label: preset.label,
                    }))}
                    active={String(maxStaleHours)}
                    onChange={(next) => setMaxStaleHours(Number(next))}
                    activeTone="arcane"
                  />
                </View>
              </View>

              <Text style={styles.label}>{copy.minVolume}</Text>
              <FilterChips
                items={VOLUME_PRESETS.map((preset) => ({
                  value: String(preset.value),
                  label: preset.label,
                }))}
                active={String(minVolume)}
                onChange={(next) => setMinVolume(Number(next))}
                activeTone="arcane"
              />
            </View>
          ) : null}

          <Pressable
            onPress={runSearch}
            disabled={loading}
            style={({ pressed }) => [
              styles.searchButton,
              loading && styles.searchButtonDisabled,
              pressed && styles.searchButtonPressed,
            ]}
          >
            {loading ? <ActivityIndicator color={themeColors.bgCanvas} size="small" /> : <Ionicons name="search" size={18} color={themeColors.bgCanvas} />}
            <Text style={styles.searchButtonText}>{loading ? copy.searching : copy.search}</Text>
          </Pressable>
        </View>

        {error ? <ErrorBlock error={error} /> : null}

        {!hasSearched && !error ? (
          <GlowCard variant="arcane" style={styles.startCard}>
            <Text style={styles.startTitle}>{copy.startTitle}</Text>
            <Text style={styles.startBody}>{copy.startBody}</Text>
          </GlowCard>
        ) : null}

        {best && !error ? <BestRefineCard row={best} copy={copy} /> : null}

        {hasSearched && !error ? (
          <>
            <SectionHeader
              title={copy.results}
              subtitle={data ? `${profitableCount}/${rankedRows.length} ${copy.profitable} · ${copy.resultMeta(rankedRows.length, data.investment_budget)}` : undefined}
            />

            <GlowCard padded={false}>
              {loading && !data ? (
                <View style={styles.loading}>
                  <ActivityIndicator color={themeColors.arcane} />
                </View>
              ) : null}
              {!loading && rankedRows.length === 0 ? <Text style={styles.empty}>{copy.empty}</Text> : null}
              {rankedRows.slice(0, 30).map((row, index, arr) => (
                <RefiningRowView
                  key={`${row.refined_id}-${row.buy_city}-${row.refine_city}-${row.sell_city}-${index}`}
                  row={row}
                  rank={index + 1}
                  sellOptions={sellOptionsForRow(row, rows)}
                  copy={copy}
                  isLast={index === arr.length - 1}
                  expanded={expandedRowKey === rowKey(row)}
                  onPress={() => {
                    const nextKey = rowKey(row);
                    setExpandedRowKey((current) => (current === nextKey ? null : nextKey));
                  }}
                />
              ))}
            </GlowCard>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function BestRefineCard({
  row,
  copy,
}: {
  row: RefiningRow;
  copy: (typeof COPY)[LanguageCode];
}) {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const styles = useMemo(() => makeRefiningStyles(themeColors), [themeColors]);
  const route = routeProfile(row.buy_city, row.refine_city, row.sell_city);
  const isProfitable = budgetProfit(row) > 0;
  const crafts = budgetRuns(row);
  const load = planLoad(row);

  return (
    <GlowCard variant="arcane" style={styles.heroCard}>
      <View style={styles.heroTop}>
        <View style={styles.heroTitleWrap}>
          <Text style={styles.heroEyebrow}>{copy.bestPick}</Text>
          <Text style={styles.heroTitle}>
            {row.mat_label ?? copy.materialFallback} T{row.tier ?? '-'}
          </Text>
          <Text style={styles.heroMeta}>
            {copy.noFocus} · {copy.bonusCity} {shortCity(row.refine_city ?? '')} · {routeLabel(route.level, copy)}
          </Text>
        </View>
        <View style={[styles.rankBadge, isProfitable ? styles.profitBadge : styles.lossBadge]}>
          <Ionicons name="trophy" size={15} color={themeColors.arcane} />
          <Text style={styles.rankText}>{isProfitable ? copy.profitable : copy.losing}</Text>
        </View>
      </View>

      <Text style={[styles.heroProfit, !isProfitable && styles.negativeProfit]}>{formatProfit(budgetProfit(row))}</Text>
      <Text style={styles.heroMeta}>
        {copy.planProfit} · {crafts} {copy.refinedPieces} · {formatTradeRoute(row.buy_city, row.refine_city, row.sell_city, language)}
      </Text>
      <View style={styles.heroStats}>
        <MiniStat label={copy.neededForOne} value={formatRecipePerUnit(row)} />
        <MiniStat label={copy.costPerRun} value={formatSilver(purchaseCostPerRun(row))} />
        <MiniStat label={copy.unitProfit} value={formatProfit(row.profit_conservative ?? row.profit)} />
        <MiniStat label={copy.maxBuyPrice} value={formatSilver(row.max_buy_price_raw_break_even)} />
        <MiniStat label={copy.totalSpend} value={formatSilver(row.investment_required)} />
        <MiniStat label={copy.oxTrips} value={`${oxTrips(row)} (${Math.round(load)} kg)`} />
        <MiniStat label={copy.refineAndSell} value={shortCity(row.refine_city ?? '')} />
      </View>
      <ShoppingList row={row} crafts={crafts} copy={copy} />
    </GlowCard>
  );
}

function RefiningRowView({
  row,
  rank,
  sellOptions,
  copy,
  isLast,
  expanded,
  onPress,
}: {
  row: RefiningRow;
  rank: number;
  sellOptions: RefiningRow[];
  copy: (typeof COPY)[LanguageCode];
  isLast: boolean;
  expanded: boolean;
  onPress: () => void;
}) {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const styles = useMemo(() => makeRefiningStyles(themeColors), [themeColors]);
  const confidence = row.confidence_score ?? 0;
  const riskTone = row.risk_label === 'low' ? themeColors.arcane : row.risk_label === 'medium' ? themeColors.amber : themeColors.rose;
  const route = routeProfile(row.buy_city, row.refine_city, row.sell_city);
  const isProfitable = budgetProfit(row) > 0;
  const crafts = budgetRuns(row);
  const load = planLoad(row);

  return (
    <View style={[styles.rowWrapper, isLast ? null : styles.rowDivider]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.rankCircle}>
          <Text style={styles.rankCircleText}>{rank}</Text>
        </View>

        <View style={styles.rowBody}>
          <View style={styles.rowTitleLine}>
            <Text style={styles.rowEmoji}>{row.mat_emoji ?? materialFallbackIcon(row.mat_type)}</Text>
            <Text style={styles.rowName}>
              {row.mat_label ?? copy.materialFallback} T{row.tier ?? '-'}
            </Text>
            <View style={[styles.statusBadge, isProfitable ? styles.profitBadge : styles.lossBadge]}>
              <Text style={[styles.statusText, isProfitable ? styles.statusProfitText : styles.statusLossText]}>
                {isProfitable ? copy.profitable : copy.losing}
              </Text>
            </View>
          </View>
          <Text style={styles.rowMeta}>
            {copy.route} {formatTradeRoute(row.buy_city, row.refine_city, row.sell_city, language)}
          </Text>
          <Text style={styles.rowMeta}>
            {copy.oneRefine}: {copy.neededForOne} {formatSilver(purchaseCostPerRun(row))} · {copy.unitProfit} {formatProfit(row.profit_conservative ?? row.profit)}
          </Text>
          <Text style={styles.rowMeta}>
            {copy.maxBuyPrice} {formatSilver(row.max_buy_price_raw_break_even)} · {copy.refineAndSell} {shortCity(row.refine_city ?? '')}
          </Text>
          <Text style={styles.rowMeta}>
            {copy.refinedPieces} {crafts} · {copy.totalSpend} {formatSilver(row.investment_required)} · {copy.oxTrips} {oxTrips(row)}
          </Text>
          <Text style={styles.rowMeta}>
            {copy.avgShopCost} {formatSilver(row.station_fee_conservative ?? row.station_fee)} · {copy.returnRate} {formatPercent(row.rr_pct, 1)} · {copy.volumeDay} {row.avg_daily_vol ?? 0}/day
          </Text>
          <Text style={[styles.riskText, { color: riskTone }]}>{confidence}% {copy.confidence}</Text>
        </View>

        <View style={styles.rowRight}>
          <Text style={[styles.rowProfit, !isProfitable && styles.negativeProfit]}>{formatProfit(budgetProfit(row))}</Text>
          <Text style={styles.rowSub}>{copy.planProfit}</Text>
          <Text style={styles.rowSub}>{formatProfit(row.profit_conservative ?? row.profit)} / ks</Text>
          <Text style={styles.rowSub}>{copy.roi} {formatPercent(row.roi_pct, 1)}</Text>
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.sellPanel}>
          <ShoppingList row={row} crafts={crafts} copy={copy} compact />
          <Text style={styles.sellPanelTitle}>{copy.sellOptions}</Text>
          {sellOptions.slice(0, 5).map((option, index) => (
            <View key={`${option.sell_city}-${option.sell_price}-${index}`} style={styles.sellOption}>
              <Text style={styles.sellRank}>#{index + 1}</Text>
              <View style={styles.sellBody}>
                <Text style={styles.sellCity}>{formatTradeRoute(option.buy_city, option.refine_city, option.sell_city, language)}</Text>
                <View style={styles.inlineMetaRow}>
                  <Text style={styles.sellMeta}>
                    {copy.sell} {formatSilver(option.sell_price_conservative ?? option.sell_price)}
                  </Text>
                  <PriceAgeBadge updated={option.sell_updated} compact />
                  <Text style={styles.sellMeta}>· {copy.avgShopCost} {formatSilver(option.station_fee_conservative ?? option.station_fee)}</Text>
                </View>
              </View>
              <View style={styles.sellRight}>
                <Text style={styles.sellProfit}>{formatProfit(budgetProfit(option))}</Text>
                <Text style={styles.sellMeta}>{formatProfit(option.profit_conservative ?? option.profit)} / {copy.perRun}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => makeRefiningStyles(themeColors), [themeColors]);
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatLabel}>{label}</Text>
      <Text style={styles.miniStatValue}>{value}</Text>
    </View>
  );
}

function ShoppingList({
  row,
  crafts,
  copy,
  compact = false,
}: {
  row: RefiningRow;
  crafts: number;
  copy: (typeof COPY)[LanguageCode];
  compact?: boolean;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => makeRefiningStyles(themeColors), [themeColors]);
  const inputs = row.input_breakdown ?? [];

  if (inputs.length === 0 || crafts <= 0) return null;

  return (
    <View style={compact ? styles.shoppingListCompact : styles.shoppingList}>
      <Text style={styles.shoppingTitle}>{copy.shoppingList}</Text>
      {inputs.map((input) => {
        const qty = Math.round((input.qty ?? 0) * crafts);
        const unitPrice = input.price_conservative ?? input.price ?? 0;
        const subtotal = unitPrice * qty;
        return (
          <View key={`${input.item_id}-${input.buy_city}`} style={styles.shoppingRow}>
            <Text style={styles.shoppingQty}>{qty}x</Text>
            <View style={styles.shoppingBody}>
              <Text style={styles.shoppingItem}>{formatItemId(input.item_id)}</Text>
              <Text style={styles.shoppingMeta}>
                {shortCity(input.buy_city ?? row.buy_city ?? '')} · {formatSilver(unitPrice)} / ks
              </Text>
              <PriceAgeBadge updated={input.updated} />
            </View>
            <Text style={styles.shoppingCost}>{formatSilver(subtotal)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function NumberPickerWithCustom({
  value,
  onChange,
  presets,
  unit,
  placeholder,
  minValue = 0,
  maxValue,
  decimal = false,
}: {
  value: number;
  onChange: (n: number) => void;
  presets: ReadonlyArray<{ value: number; label: string }>;
  unit: string;
  placeholder: string;
  minValue?: number;
  maxValue?: number;
  decimal?: boolean;
}) {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const copy = COPY[language];
  const styles = useMemo(() => makeRefiningStyles(themeColors), [themeColors]);
  const [draft, setDraft] = useState<string>(String(value));

  const commit = () => {
    const normalized = draft.replace(',', '.').replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
    const parsed = decimal ? Number.parseFloat(normalized) : parseInt(normalized, 10);
    if (!Number.isFinite(parsed) || parsed < minValue) {
      setDraft(String(value));
      return;
    }
    const clamped = maxValue !== undefined ? Math.min(parsed, maxValue) : parsed;
    setDraft(String(clamped));
    onChange(clamped);
  };

  return (
    <View style={styles.numberPicker}>
      <FilterChips
        items={presets.map((preset) => ({
          value: String(preset.value),
          label: preset.label,
        }))}
        active={String(value)}
        onChange={(next) => {
          setDraft(next);
          onChange(Number(next));
        }}
        activeTone="arcane"
      />
      <View style={styles.customRow}>
        <Text style={styles.customLabel}>{copy.custom}</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          maxLength={10}
          placeholder={placeholder}
          placeholderTextColor={themeColors.textMuted}
          style={styles.customInput}
          selectTextOnFocus
          returnKeyType="done"
        />
        <Text style={styles.customUnit}>{unit}</Text>
      </View>
    </View>
  );
}

function bestRowsByMaterialTier(rows: RefiningRow[]): RefiningRow[] {
  const best = new Map<string, RefiningRow>();
  rows.forEach((row) => {
    const key = `${row.mat_type ?? 'material'}-${row.tier ?? 'tier'}`;
    const current = best.get(key);
    if (!current || compareBudgetPlans(row, current) < 0) {
      best.set(key, row);
    }
  });
  return [...best.values()];
}

function sellOptionsForRow(row: RefiningRow, rows: RefiningRow[]): RefiningRow[] {
  return rows
    .filter((candidate) =>
      candidate.mat_type === row.mat_type &&
      candidate.tier === row.tier &&
      candidate.refine_city === row.refine_city,
    )
    .sort(compareBudgetPlans);
}

function rowKey(row: RefiningRow): string {
  return `${row.mat_type ?? 'material'}-${row.tier ?? 'tier'}-${row.refine_city ?? 'city'}-${row.sell_city ?? 'sell'}`;
}

function formatRecipePerUnit(row: RefiningRow): string {
  const inputs = row.input_breakdown ?? [];
  if (inputs.length === 0) return formatSilver(purchaseCostPerRun(row));
  return inputs
    .map((input) => `${input.qty ?? 0}x ${formatItemId(input.item_id)}`)
    .join(' + ');
}

function budgetProfit(row: RefiningRow): number {
  return row.profit_for_investment_budget ?? perRunProfit(row) * budgetRuns(row);
}

function purchaseCostPerRun(row: RefiningRow): number {
  return row.purchase_cost_conservative ??
    (row.nominal_cost_conservative ?? row.nominal_cost ?? 0) +
      (row.station_fee_conservative ?? row.station_fee ?? 0) +
      (row.transport_fee ?? 0);
}

function perRunProfit(row: RefiningRow): number {
  return row.profit_conservative ?? row.profit ?? 0;
}

function budgetRuns(row: RefiningRow): number {
  return row.budget_crafts_estimate ?? row.silver_budget_crafts_estimate ?? 0;
}

function planLoad(row: RefiningRow): number {
  return budgetRuns(row) * weightPerCraft(row);
}

function oxTrips(row: RefiningRow): number {
  const load = planLoad(row);
  return load > 0 ? Math.ceil(load / T7_OX_LOAD_KG) : 0;
}

function weightPerCraft(row: RefiningRow): number {
  return (row.input_weight_kg ?? DEFAULT_INPUT_WEIGHT_KG) + (row.output_weight_kg ?? DEFAULT_OUTPUT_WEIGHT_KG);
}

type RouteLevel = 'same' | 'short' | 'medium' | 'long';

function routeProfile(buyCity: unknown, refineCity: unknown, sellCity: unknown): { steps: number; level: RouteLevel } {
  const inputSteps = cityDistance(buyCity, refineCity);
  const outputSteps = cityDistance(refineCity, sellCity);
  const steps = inputSteps + outputSteps;
  if (steps <= 0) return { steps, level: 'same' };
  if (steps <= 2) return { steps, level: 'short' };
  if (steps <= 4) return { steps, level: 'medium' };
  return { steps, level: 'long' };
}

function routeLabel(level: RouteLevel, copy: (typeof COPY)[LanguageCode]): string {
  switch (level) {
    case 'same':
      return copy.sameCity;
    case 'short':
      return copy.shortRoute;
    case 'medium':
      return copy.mediumRoute;
    case 'long':
      return copy.longRoute;
  }
}

function cityDistance(fromCity: unknown, toCity: unknown): number {
  const from = normalizeCity(fromCity);
  const to = normalizeCity(toCity);
  if (!from || !to || from === to) return 0;
  const closePairs = new Set([
    'Bridgewatch|Martlock',
    'Martlock|Lymhurst',
    'Lymhurst|Thetford',
    'Thetford|Fort Sterling',
    'Fort Sterling|Martlock',
  ]);
  const key = [from, to].sort().join('|');
  if (closePairs.has(key)) return 1;
  if (from === 'Caerleon' || to === 'Caerleon') return 3;
  return 2;
}

function normalizeCity(city: unknown): string | null {
  return typeof city === 'string' && city.length > 0 ? city : null;
}

function formatTradeRoute(buyCity: unknown, refineCity: unknown, sellCity: unknown, language: LanguageCode): string {
  const buy = typeof buyCity === 'string' ? buyCity : '-';
  const refine = typeof refineCity === 'string' ? refineCity : '-';
  const sell = typeof sellCity === 'string' ? sellCity : '-';
  if (sell === refine) {
    return buy === refine ? `${shortCity(refine)} ${language === 'cs' ? 'lokálně' : 'local'}` : `${shortCity(buy)} -> ${shortCity(refine)}`;
  }
  if (buy === refine) return formatRoute(refine, sell, language);
  return `${shortCity(buy)} -> ${shortCity(refine)} -> ${shortCity(sell)}`;
}

function formatItemId(itemId: unknown): string {
  if (typeof itemId !== 'string') return '-';
  return itemId
    .replace(/^T(\d+)_/, 'T$1 ')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function materialLabel(material: MaterialFilter): string {
  return MATERIAL_FILTERS.find((item) => item.value === material)?.label ?? 'All';
}

function cityLabel(city: CityFilter): string {
  return CITY_FILTERS.find((item) => item.value === city)?.label ?? 'Auto';
}

function materialFallbackIcon(matType: unknown): string {
  switch (matType) {
    case 'METALBAR':
      return 'M';
    case 'PLANKS':
      return '*';
    case 'LEATHER':
      return 'L';
    case 'CLOTH':
      return 'C';
    case 'STONEBLOCK':
      return 'S';
    default:
      return '+';
  }
}

function PriceAgeBadge({ updated, compact = false }: { updated?: string; compact?: boolean }) {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const styles = useMemo(() => makeRefiningStyles(themeColors), [themeColors]);
  const age = priceAgeInfo(updated, themeColors, language);

  return (
    <View style={[styles.priceAgeBadge, compact && styles.priceAgeBadgeCompact]}>
      <View style={[styles.priceAgeDot, { backgroundColor: age.color }]} />
      <Text style={[styles.priceAgeText, { color: age.color }]}>{age.label}</Text>
    </View>
  );
}

function priceAgeInfo(updated: string | undefined, colors: AppColors, language: LanguageCode): { label: string; color: string } {
  if (!updated) {
    return { label: language === 'en' ? 'age ?' : 'stáří ?', color: colors.textMuted };
  }
  const parsed = new Date(updated.replace(' ', 'T'));
  const time = parsed.getTime();
  if (!Number.isFinite(time)) {
    return { label: language === 'en' ? 'age ?' : 'stáří ?', color: colors.textMuted };
  }
  const hours = Math.max(0, (Date.now() - time) / 3_600_000);
  const label = formatPriceAgeLabel(hours, language);
  if (hours < 1) return { label, color: colors.arcane };
  if (hours < 6) return { label, color: colors.amber };
  if (hours < 24) return { label, color: colors.bronze };
  return { label, color: colors.rose };
}

function formatPriceAgeLabel(hours: number, language: LanguageCode): string {
  if (hours < 1) return language === 'en' ? '<1h' : '<1h';
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.max(1, Math.round(hours / 24));
  return language === 'en' ? `${days}d` : `${days}d`;
}

function ErrorBlock({ error }: { error: string }) {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const copy = COPY[language];
  const styles = useMemo(() => makeRefiningStyles(themeColors), [themeColors]);

  return (
    <GlowCard variant="rose" style={styles.errorCard}>
      <Text style={styles.errorTitle}>{copy.backendUnavailable}</Text>
      <Text style={styles.errorBody}>{error}</Text>
    </GlowCard>
  );
}

function makeRefiningStyles(colors: AppColors) {
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
    searchPanel: {
      marginTop: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface1,
      overflow: 'hidden',
    },
    settingsHeader: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.base,
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.sm,
    },
    settingsTitleWrap: { flex: 1, minWidth: 0 },
    settingsTitle: { ...typography.bodyStrong, color: colors.textPrimary },
    settingsMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    settingsBody: {
      paddingHorizontal: spacing.base,
      paddingBottom: spacing.base,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    label: {
      ...typography.captionStrong,
      color: colors.textMuted,
      marginTop: spacing.base,
      marginBottom: spacing.xs + 2,
    },
    sectionLabel: {
      ...typography.captionStrong,
      color: colors.arcane,
      marginTop: spacing.lg,
      marginBottom: -spacing.xs,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    settingPair: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.base,
      alignItems: 'flex-start',
    },
    settingColumn: {
      flex: 1,
      minWidth: 132,
    },
    numberPicker: { gap: spacing.xs },
    customRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    customLabel: {
      ...typography.captionStrong,
      color: colors.textMuted,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    customInput: {
      flex: 1,
      minWidth: 90,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.base,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface2,
      color: colors.textPrimary,
      ...typography.bodyStrong,
      fontVariant: ['tabular-nums'],
    },
    customUnit: { ...typography.caption, color: colors.textSecondary, fontSize: 11 },
    searchButton: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      backgroundColor: colors.arcane,
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.arcaneGlow,
    },
    searchButtonDisabled: { opacity: 0.72 },
    searchButtonPressed: { opacity: 0.9 },
    searchButtonText: { ...typography.bodyStrong, color: colors.bgCanvas },
    startCard: { marginTop: spacing.lg },
    startTitle: { ...typography.heroTitle, color: colors.textPrimary },
    startBody: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
    heroCard: { marginTop: spacing.lg },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.base,
    },
    heroTitleWrap: { flex: 1, minWidth: 0 },
    heroEyebrow: { ...typography.eyebrow, color: colors.arcane },
    heroTitle: { ...typography.heroTitle, color: colors.textPrimary, marginTop: spacing.xs },
    heroProfit: { ...typography.heroNumber, color: colors.arcane, marginTop: spacing.lg },
    heroMeta: { ...typography.captionStrong, color: colors.textSecondary, marginTop: spacing.xs },
    heroStats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.base,
    },
    miniStat: {
      flexGrow: 1,
      minWidth: 96,
      borderRadius: radius.base,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.tagBg,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs + 2,
    },
    miniStatLabel: { ...typography.caption, color: colors.textMuted },
    miniStatValue: { ...typography.captionStrong, color: colors.textPrimary, marginTop: 2 },
    rankBadge: {
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
    rankText: { ...typography.captionStrong, color: colors.arcane },
    profitBadge: {
      borderColor: colors.arcaneGlow,
      backgroundColor: colors.arcaneSoft,
    },
    lossBadge: {
      borderColor: colors.rose,
      backgroundColor: colors.roseSoft,
    },
    negativeProfit: { color: colors.rose },
    empty: { color: colors.textMuted, textAlign: 'center', padding: spacing.lg },
    loading: { padding: spacing.xl, alignItems: 'center' },
    rowWrapper: { backgroundColor: colors.surface1 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
    pressed: { backgroundColor: colors.tagBg },
    rankCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.arcaneSoft,
      borderWidth: 1,
      borderColor: colors.arcaneGlow,
    },
    rankCircleText: { ...typography.captionStrong, color: colors.arcane, fontVariant: ['tabular-nums'] },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
    rowEmoji: { fontSize: 15, lineHeight: 19 },
    rowName: { ...typography.bodyStrong, color: colors.textPrimary },
    statusBadge: {
      paddingHorizontal: spacing.xs + 2,
      paddingVertical: spacing.xxs,
      borderRadius: radius.pill,
      borderWidth: 1,
    },
    statusText: { ...typography.captionStrong },
    statusProfitText: { color: colors.arcane },
    statusLossText: { color: colors.rose },
    rowMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    rowRight: { alignItems: 'flex-end', minWidth: 96 },
    rowProfit: { ...typography.profit, color: colors.arcane, textAlign: 'right' },
    rowSub: { ...typography.caption, color: colors.textMuted, marginTop: 2, textAlign: 'right' },
    riskText: { ...typography.caption, marginTop: 2 },
    sellPanel: {
      marginHorizontal: spacing.base,
      marginBottom: spacing.md,
      borderRadius: radius.base,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.tagBg,
      overflow: 'hidden',
    },
    sellPanelTitle: {
      ...typography.captionStrong,
      color: colors.textSecondary,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    shoppingList: {
      marginTop: spacing.base,
      borderRadius: radius.base,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.tagBg,
      overflow: 'hidden',
    },
    shoppingListCompact: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    shoppingTitle: {
      ...typography.captionStrong,
      color: colors.textSecondary,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    shoppingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    shoppingQty: {
      ...typography.captionStrong,
      width: 54,
      color: colors.arcane,
      fontVariant: ['tabular-nums'],
    },
    shoppingBody: { flex: 1, minWidth: 0 },
    shoppingItem: { ...typography.bodyStrong, color: colors.textPrimary },
    shoppingMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    inlineMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      columnGap: spacing.xs,
      rowGap: spacing.xxs,
      marginTop: 2,
    },
    priceAgeBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.xs,
      paddingHorizontal: spacing.xs + 2,
      paddingVertical: spacing.xxs,
      borderRadius: radius.pill,
      backgroundColor: colors.tagBg,
    },
    priceAgeBadgeCompact: {
      marginTop: 0,
      paddingVertical: 1,
    },
    priceAgeDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    priceAgeText: {
      ...typography.captionStrong,
      fontVariant: ['tabular-nums'],
    },
    shoppingCost: {
      ...typography.captionStrong,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
    },
    sellOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    sellRank: { ...typography.captionStrong, width: 24, color: colors.textMuted, fontVariant: ['tabular-nums'] },
    sellBody: { flex: 1, minWidth: 0 },
    sellCity: { ...typography.bodyStrong, color: colors.textPrimary },
    sellMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    sellRight: { alignItems: 'flex-end', minWidth: 82 },
    sellProfit: { ...typography.captionStrong, color: colors.arcane, fontVariant: ['tabular-nums'] },
    errorCard: { marginTop: spacing.lg },
    errorTitle: { ...typography.heroTitle, color: colors.rose, marginBottom: spacing.xs },
    errorBody: { ...typography.body, color: colors.textPrimary },
  });
}
