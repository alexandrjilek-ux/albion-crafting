import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
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
import { useActivitiesBonuses } from '../../src/activities/ActivitiesBonusProvider';
import { FilterChips, GlowCard, MultiFilterChips, SectionHeader, ThemeToggle } from '../../src/components';
import { useLanguage, type LanguageCode } from '../../src/i18n/LanguageProvider';
import { colors, type AppColors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius, spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { formatPercent, formatProfit, formatRoute, formatSilver, formatSilverCompact } from '../../src/utils/format';

type MaterialFilter = 'ALL' | 'METALBAR' | 'PLANKS' | 'LEATHER' | 'CLOTH' | 'STONEBLOCK';

const TIER_FILTERS: ReadonlyArray<{ value: number; label: string }> = [4, 5, 6, 7, 8].map((tier) => ({
  value: tier,
  label: `T${tier}`,
}));

const MATERIAL_FILTERS: ReadonlyArray<{ value: MaterialFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'METALBAR', label: 'Bars' },
  { value: 'PLANKS', label: 'Planks' },
  { value: 'LEATHER', label: 'Leather' },
  { value: 'CLOTH', label: 'Cloth' },
  { value: 'STONEBLOCK', label: 'Stone' },
];

const FOCUS_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 10_000, label: '10k' },
  { value: 20_000, label: '20k' },
  { value: 30_000, label: '30k' },
];

const COPY: Record<LanguageCode, {
  title: string;
  subtitle: string;
  material: string;
  tiers: string;
  focusBudget: string;
  useFocus: string;
  noFocus: string;
  bestItems: string;
  profitable: string;
  empty: string;
  bestEstimate: string;
  materialFallback: string;
  piecesWithFocus: (pieces: number) => string;
  piecesForFocus: (pieces: number, focus: number) => string;
  perPieceEstimate: string;
  dailyIfSold: string;
  noFocusEstimate: string;
  bestTier: (tier?: number) => string;
  sell: string;
  cost: string;
  profitPiece: string;
  volumeDay: string;
  pieces: string;
  confidence: string;
  bonus: string;
  bestSellCities: string;
  refinedIn: string;
  tapForSell: string;
  backendUnavailable: string;
  custom: string;
}> = {
  cs: {
    title: 'Refining',
    subtitle: 'Vyber materiál a focus, potom uvidíš kolik kusů vyrefinuješ a kde je prodat.',
    material: 'Materiál',
    tiers: 'Tiery',
    focusBudget: 'Focus budget',
    useFocus: 'Používat focus',
    noFocus: 'Bez focusu',
    bestItems: 'Nejlepší kusy k refine',
    profitable: 'profitabilní',
    empty: 'Zatím žádná refining data.',
    bestEstimate: 'Nejlepší odhad',
    materialFallback: 'Materiál',
    piecesWithFocus: (pieces) => `${pieces} ks za tvůj focus`,
    piecesForFocus: (pieces, focus) => `Za ${formatSilver(focus)} focus vyrefinuješ ${pieces} ks`,
    perPieceEstimate: 'profit za kus',
    dailyIfSold: 'denne pri prodeji',
    noFocusEstimate: 'Odhad bez focusu',
    bestTier: (tier) => `Nejlepší T${tier ?? '-'}`,
    sell: 'prodej',
    cost: 'náklad',
    profitPiece: 'profit/ks',
    volumeDay: 'vol',
    pieces: 'ks',
    confidence: 'jistota',
    bonus: 'bonus',
    bestSellCities: 'Kde prodat',
    refinedIn: 'refine',
    tapForSell: 'klepni pro prodejní města',
    backendUnavailable: 'Backend nedostupný',
    custom: 'Vlastní',
  },
  en: {
    title: 'Refining',
    subtitle: 'Pick material and focus, then see how many pieces you can refine and where to sell them.',
    material: 'Material',
    tiers: 'Tiers',
    focusBudget: 'Focus budget',
    useFocus: 'Use focus',
    noFocus: 'No focus',
    bestItems: 'Best pieces to refine',
    profitable: 'profitable',
    empty: 'No refining data yet.',
    bestEstimate: 'Best estimate',
    materialFallback: 'Material',
    piecesWithFocus: (pieces) => `${pieces} pcs with your focus`,
    piecesForFocus: (pieces, focus) => `With ${formatSilver(focus)} focus you can refine ${pieces} pcs`,
    perPieceEstimate: 'profit per piece',
    dailyIfSold: 'daily if sold',
    noFocusEstimate: 'No-focus estimate',
    bestTier: (tier) => `Best T${tier ?? '-'}`,
    sell: 'sell',
    cost: 'cost',
    profitPiece: 'profit/pc',
    volumeDay: 'vol',
    pieces: 'pcs',
    confidence: 'confidence',
    bonus: 'bonus',
    bestSellCities: 'Where to sell',
    refinedIn: 'refine',
    tapForSell: 'tap for sell cities',
    backendUnavailable: 'Backend unavailable',
    custom: 'Custom',
  },
};

export default function RefiningScreen() {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const { selectedCategories } = useActivitiesBonuses();
  const copy = COPY[language];
  const styles = useMemo(() => makeRefiningStyles(themeColors), [themeColors]);

  const [tiers, setTiers] = useState<number[]>([4, 5, 6]);
  const [useFocus, setUseFocus] = useState<boolean>(true);
  const [focusBudget, setFocusBudget] = useState<number>(10_000);
  const [material, setMaterial] = useState<MaterialFilter>('ALL');
  const [data, setData] = useState<RefiningResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchRefining({
      tiers: [...tiers].sort((a, b) => a - b),
      focus_budget: useFocus ? focusBudget : 0,
      history_days: 7,
      min_volume: 0,
      bonus_only: true,
      activity_bonus_categories: selectedCategories,
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Network error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tiers, useFocus, focusBudget, selectedCategories]);

  const toggleTier = (tier: number) => {
    setTiers((prev) =>
      prev.includes(tier) ? prev.filter((value) => value !== tier) : [...prev, tier],
    );
  };

  const rows = data?.rows ?? [];
  const bonusRows = useMemo(() => rows.filter((row) => row.has_bonus), [rows]);
  const materialRows = useMemo(() => bestRowsByMaterial(bonusRows), [bonusRows]);
  const filteredRows = useMemo(
    () => (material === 'ALL' ? bonusRows : bonusRows.filter((row) => row.mat_type === material)),
    [bonusRows, material],
  );
  const visibleRows = useMemo(() => bestRowsByMaterialTier(filteredRows), [filteredRows]);
  const best = visibleRows[0] ?? bonusRows[0] ?? rows[0];
  const effectiveFocusBudget = useFocus ? focusBudget : 0;
  const profitableRows = visibleRows.filter((row) => budgetProfit(row, effectiveFocusBudget) > 0).length;

  useEffect(() => {
    setExpandedRowKey(null);
  }, [material, tiers]);

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

        <Text style={styles.label}>{copy.focusBudget}</Text>
        <View style={styles.focusToggleRow}>
          <Pressable
            onPress={() => setUseFocus((value) => !value)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.focusSwitch,
              useFocus && styles.focusSwitchOn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.focusSwitchText, useFocus && styles.focusSwitchTextOn]}>
              {useFocus ? copy.useFocus : copy.noFocus}
            </Text>
          </Pressable>
        </View>
        {useFocus ? (
          <NumberPickerWithCustom
            value={focusBudget}
            onChange={setFocusBudget}
            presets={FOCUS_PRESETS}
            unit="focus"
            placeholder="10000"
            minValue={1}
            maxValue={30_000}
          />
        ) : null}

        {best ? <BestRefineCard row={best} focusBudget={effectiveFocusBudget} copy={copy} /> : null}

        <View style={styles.summaryGrid}>
          {materialRows.map((row) => (
            <MaterialSummaryCard
              key={row.mat_type ?? row.refined_id}
              row={row}
              focusBudget={effectiveFocusBudget}
              copy={copy}
              active={material === row.mat_type}
              onPress={() => {
                if (isMaterialFilter(row.mat_type)) setMaterial(row.mat_type);
              }}
            />
          ))}
        </View>

        <SectionHeader
          title={copy.bestItems}
          subtitle={data ? `${profitableRows}/${visibleRows.length} ${copy.profitable}` : undefined}
        />

        {error ? (
          <ErrorBlock error={error} />
        ) : loading && !data ? (
          <View style={styles.loading}>
            <ActivityIndicator color={themeColors.arcane} />
          </View>
        ) : (
          <GlowCard padded={false}>
            {visibleRows.slice(0, 24).map((row, idx, arr) => (
              <RefiningRowView
                key={`${row.refined_id}-${row.refine_city}-${row.sell_city}-${idx}`}
                row={row}
                sellOptions={sellOptionsForRow(row, filteredRows)}
                focusBudget={effectiveFocusBudget}
                copy={copy}
                isLast={idx === arr.length - 1}
                expanded={expandedRowKey === rowKey(row)}
                onPress={() => {
                  const nextKey = rowKey(row);
                  setExpandedRowKey((current) => (current === nextKey ? null : nextKey));
                }}
              />
            ))}
            {visibleRows.length === 0 && !loading ? <Text style={styles.empty}>{copy.empty}</Text> : null}
          </GlowCard>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BestRefineCard({
  row,
  focusBudget,
  copy,
}: {
  row: RefiningRow;
  focusBudget: number;
  copy: (typeof COPY)[LanguageCode];
}) {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const styles = useMemo(() => makeRefiningStyles(themeColors), [themeColors]);
  const expectedProfit = budgetProfit(row, focusBudget);
  const route = formatRoute(row.refine_city, row.sell_city, language);
  const confidence = row.confidence_score ?? 0;
  const crafts = craftsForBudget(row, focusBudget);
  const daily = row.risk_adjusted_daily_profit ?? 0;

  return (
    <GlowCard variant="frost" style={styles.heroCard}>
      <View style={styles.heroTop}>
        <View>
          <Text style={styles.heroEyebrow}>{copy.bestEstimate}</Text>
          <Text style={styles.heroTitle}>
            {row.mat_label ?? copy.materialFallback} T{row.tier ?? '-'}
          </Text>
        </View>
        <View style={styles.confidenceBadge}>
          <Ionicons name="shield-checkmark" size={14} color={themeColors.frost} />
          <Text style={styles.confidenceText}>{confidence}%</Text>
        </View>
      </View>

      <Text style={styles.heroProfit}>{formatProfit(expectedProfit)}</Text>
      <Text style={styles.heroMeta}>
        {row.use_focus
          ? copy.piecesWithFocus(crafts)
          : `${copy.perPieceEstimate} - ${formatSilverCompact(daily)} ${copy.dailyIfSold}`} - {route} - RR {formatPercent(row.rr_pct, 1)}
      </Text>
    </GlowCard>
  );
}

function MaterialSummaryCard({
  row,
  focusBudget,
  copy,
  active,
  onPress,
}: {
  row: RefiningRow;
  focusBudget: number;
  copy: (typeof COPY)[LanguageCode];
  active: boolean;
  onPress: () => void;
}) {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const styles = useMemo(() => makeRefiningStyles(themeColors), [themeColors]);
  const profit = budgetProfit(row, focusBudget);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.materialCard,
        active && styles.materialCardActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.materialEmoji}>{row.mat_emoji ?? materialFallbackIcon(row.mat_type)}</Text>
      <View style={styles.materialBody}>
        <Text style={styles.materialName} numberOfLines={1}>{row.mat_label ?? copy.materialFallback}</Text>
        <Text style={styles.materialMeta}>{copy.bestTier(row.tier)} - {formatRoute(row.refine_city, row.sell_city, language)}</Text>
      </View>
      <Text style={styles.materialProfit}>{formatProfit(profit)}</Text>
    </Pressable>
  );
}

function RefiningRowView({
  row,
  sellOptions,
  focusBudget,
  copy,
  isLast,
  expanded,
  onPress,
}: {
  row: RefiningRow;
  sellOptions: RefiningRow[];
  focusBudget: number;
  copy: (typeof COPY)[LanguageCode];
  isLast: boolean;
  expanded: boolean;
  onPress: () => void;
}) {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const styles = useMemo(() => makeRefiningStyles(themeColors), [themeColors]);
  const profit = row.profit_conservative ?? row.profit;
  const expectedProfit = budgetProfit(row, focusBudget);
  const crafts = craftsForBudget(row, focusBudget);
  const daily = row.risk_adjusted_daily_profit ?? 0;
  const confidence = row.confidence_score ?? 0;
  const riskTone = row.risk_label === 'low' ? themeColors.frost : row.risk_label === 'medium' ? themeColors.amber : themeColors.rose;

  return (
    <View style={[styles.rowWrapper, isLast ? null : styles.rowDivider]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.rowBody}>
          <View style={styles.rowTitleLine}>
            <Text style={styles.rowEmoji}>{row.mat_emoji ?? materialFallbackIcon(row.mat_type)}</Text>
            <Text style={styles.rowName}>
              {row.mat_label ?? copy.materialFallback} - T{row.tier ?? '-'}
            </Text>
            {row.has_bonus ? (
              <View style={styles.bonusBadge}>
                <Text style={styles.bonusText}>{copy.bonus}</Text>
              </View>
            ) : null}
            {row.has_activity_bonus ? (
              <View style={styles.activityBadge}>
                <Text style={styles.activityText}>Activities</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.rowMeta}>
            {copy.refinedIn} {row.refine_city ?? '-'} - {copy.sell} {formatSilver(row.sell_price_conservative ?? row.sell_price)}
          </Text>
          <Text style={styles.rowMeta}>
            {copy.cost} {formatSilver(row.total_cost_conservative ?? row.total_cost ?? row.eff_cost_conservative ?? row.eff_cost)} - {copy.profitPiece} {formatProfit(profit)} - {copy.volumeDay} {row.avg_daily_vol ?? 0}/day
          </Text>
          <Text style={styles.rowHint}>{copy.tapForSell}</Text>
        </View>

        <View style={styles.rowRight}>
          <Text style={styles.rowProfit}>{formatProfit(expectedProfit)}</Text>
          <Text style={styles.rowSub}>
            {row.use_focus ? copy.piecesForFocus(crafts, focusBudget) : `${formatSilverCompact(daily)} ${copy.dailyIfSold}`}
          </Text>
          <Text style={[styles.riskText, { color: riskTone }]}>{confidence}% {copy.confidence}</Text>
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.sellPanel}>
          <Text style={styles.sellPanelTitle}>{copy.bestSellCities}</Text>
          {sellOptions.slice(0, 6).map((option, index) => (
            <View key={`${option.sell_city}-${option.sell_price}-${index}`} style={styles.sellOption}>
              <Text style={styles.sellRank}>#{index + 1}</Text>
              <View style={styles.sellBody}>
                <Text style={styles.sellCity}>{formatRoute(option.refine_city, option.sell_city, language)}</Text>
                <Text style={styles.sellMeta}>
                  {copy.sell} {formatSilver(option.sell_price_conservative ?? option.sell_price)} - {copy.volumeDay} {option.avg_daily_vol ?? 0}/day
                </Text>
              </View>
              <View style={styles.sellRight}>
                <Text style={styles.sellProfit}>{formatProfit(budgetProfit(option, focusBudget))}</Text>
                <Text style={styles.sellMeta}>{formatProfit(option.profit_conservative ?? option.profit)} /{copy.pieces}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function bestRowsByMaterial(rows: RefiningRow[]): RefiningRow[] {
  const best = new Map<string, RefiningRow>();
  rows.forEach((row) => {
    const key = String(row.mat_type ?? row.mat_label ?? row.refined_id ?? '');
    const current = best.get(key);
    if (!current || scoreRow(row) > scoreRow(current)) {
      best.set(key, row);
    }
  });
  return [...best.values()].sort((a, b) => materialOrder(a) - materialOrder(b));
}

function bestRowsByMaterialTier(rows: RefiningRow[]): RefiningRow[] {
  const best = new Map<string, RefiningRow>();
  rows.forEach((row) => {
    const key = `${row.mat_type ?? 'material'}-${row.tier ?? 'tier'}`;
    const current = best.get(key);
    if (!current || scoreRow(row) > scoreRow(current)) {
      best.set(key, row);
    }
  });
  return [...best.values()].sort((a, b) => scoreRow(b) - scoreRow(a));
}

function sellOptionsForRow(row: RefiningRow, rows: RefiningRow[]): RefiningRow[] {
  return rows
    .filter((candidate) =>
      candidate.mat_type === row.mat_type &&
      candidate.tier === row.tier &&
      candidate.refine_city === row.refine_city,
    )
    .sort((a, b) => scoreRow(b) - scoreRow(a));
}

function rowKey(row: RefiningRow): string {
  return `${row.mat_type ?? 'material'}-${row.tier ?? 'tier'}-${row.refine_city ?? 'city'}`;
}

function scoreRow(row: RefiningRow): number {
  return (
    row.use_focus
      ? row.profit_for_focus_budget ??
        row.risk_adjusted_daily_profit ??
        row.silver_per_focus_conservative ??
        row.profit_conservative ??
        row.profit ??
        0
      : row.profit_conservative ?? row.profit ?? row.risk_adjusted_daily_profit ?? 0
  );
}

function craftsForBudget(row: RefiningRow, focusBudget?: number): number {
  if (!row.use_focus) return row.budget_crafts_estimate ?? 1;
  const budget = focusBudget ?? 10_000;
  const focusCost = row.focus_cost ?? 0;
  if (focusCost <= 0) return 0;
  return Math.floor(budget / focusCost);
}

function budgetProfit(row: RefiningRow, focusBudget?: number): number {
  const profit = row.profit_conservative ?? row.profit ?? 0;
  if (!row.use_focus) return profit;
  const crafts = craftsForBudget(row, focusBudget);
  if (crafts <= 0) return row.risk_adjusted_daily_profit ?? profit;
  return Math.round(profit * crafts);
}

function materialOrder(row: RefiningRow): number {
  const order: Record<string, number> = {
    METALBAR: 0,
    PLANKS: 1,
    LEATHER: 2,
    CLOTH: 3,
    STONEBLOCK: 4,
  };
  return order[String(row.mat_type ?? '')] ?? 99;
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

function isMaterialFilter(value: unknown): value is MaterialFilter {
  return value === 'METALBAR' || value === 'PLANKS' || value === 'LEATHER' || value === 'CLOTH' || value === 'STONEBLOCK';
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

function NumberPickerWithCustom({
  value,
  onChange,
  presets,
  unit,
  placeholder,
  minValue = 0,
  maxValue,
}: {
  value: number;
  onChange: (n: number) => void;
  presets: ReadonlyArray<{ value: number; label: string }>;
  unit: string;
  placeholder: string;
  minValue?: number;
  maxValue?: number;
}) {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const copy = COPY[language];
  const styles = useMemo(() => makeRefiningStyles(themeColors), [themeColors]);
  const [draft, setDraft] = useState<string>(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const cleaned = draft.replace(/[^0-9]/g, '');
    const parsed = parseInt(cleaned, 10);
    if (!Number.isFinite(parsed) || parsed < minValue) {
      setDraft(String(value));
      return;
    }
    const clamped = maxValue !== undefined ? Math.min(parsed, maxValue) : parsed;
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
        onChange={(next) => onChange(Number(next))}
        activeTone="frost"
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
          placeholderTextColor={themeColors.textMuted}
          style={styles.focusCustomInput}
          selectTextOnFocus
          returnKeyType="done"
        />
        <Text style={styles.focusCustomUnit}>{unit}</Text>
      </View>
    </View>
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
    label: {
      ...typography.captionStrong,
      color: colors.textMuted,
      marginTop: spacing.base,
      marginBottom: spacing.xs + 2,
    },
    numberPicker: { gap: spacing.xs },
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
      borderColor: colors.frostGlow,
      backgroundColor: colors.frostSoft,
    },
    focusSwitchText: {
      ...typography.captionStrong,
      color: colors.textSecondary,
      fontSize: 11,
    },
    focusSwitchTextOn: {
      color: colors.frost,
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
      minWidth: 90,
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
    heroCard: { marginTop: spacing.lg },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.base,
    },
    heroEyebrow: { ...typography.eyebrow, color: colors.frost },
    heroTitle: { ...typography.heroTitle, color: colors.textPrimary, marginTop: spacing.xs },
    heroProfit: { ...typography.heroNumber, color: colors.frost, marginTop: spacing.lg },
    heroMeta: { ...typography.captionStrong, color: colors.textSecondary, marginTop: spacing.xs },
    confidenceBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.frostGlow,
      backgroundColor: colors.frostSoft,
    },
    confidenceText: { ...typography.captionStrong, color: colors.frost },
    summaryGrid: {
      gap: spacing.sm,
      marginTop: spacing.base,
      marginBottom: spacing.sm,
    },
    materialCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: radius.base,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    materialCardActive: {
      borderColor: colors.arcaneGlow,
      backgroundColor: colors.arcaneSoft,
    },
    materialEmoji: { width: 24, textAlign: 'center', fontSize: 18 },
    materialBody: { flex: 1, minWidth: 0 },
    materialName: { ...typography.bodyStrong, color: colors.textPrimary },
    materialMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    materialProfit: { ...typography.captionStrong, color: colors.frost, fontVariant: ['tabular-nums'] },
    empty: { color: colors.textMuted, textAlign: 'center', padding: spacing.lg },
    loading: { padding: spacing.xl, alignItems: 'center' },
    rowWrapper: {
      backgroundColor: colors.surface1,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
    pressed: { backgroundColor: colors.tagBg },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitleLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flexWrap: 'wrap',
    },
    rowEmoji: { fontSize: 15, lineHeight: 19 },
    rowName: { ...typography.bodyStrong, color: colors.textPrimary },
    rowMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    rowHint: { ...typography.caption, color: colors.arcane, marginTop: spacing.xs },
    rowRight: { alignItems: 'flex-end', minWidth: 94 },
    rowProfit: { ...typography.profit, color: colors.frost },
    rowSub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
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
    sellOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    sellRank: {
      ...typography.captionStrong,
      width: 24,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    sellBody: { flex: 1, minWidth: 0 },
    sellCity: { ...typography.bodyStrong, color: colors.textPrimary },
    sellMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    sellRight: { alignItems: 'flex-end', minWidth: 82 },
    sellProfit: { ...typography.captionStrong, color: colors.frost, fontVariant: ['tabular-nums'] },
    bonusBadge: {
      paddingHorizontal: spacing.xs + 2,
      paddingVertical: spacing.xxs,
      borderRadius: radius.pill,
      backgroundColor: colors.arcaneSoft,
    },
    bonusText: { ...typography.captionStrong, color: colors.arcane },
    activityBadge: {
      paddingHorizontal: spacing.xs + 2,
      paddingVertical: spacing.xxs,
      borderRadius: radius.pill,
      backgroundColor: colors.frostSoft,
    },
    activityText: { ...typography.captionStrong, color: colors.frost },
    errorCard: { marginTop: spacing.lg },
    errorTitle: { ...typography.heroTitle, color: colors.rose, marginBottom: spacing.xs },
    errorBody: { ...typography.body, color: colors.textPrimary },
  });
}
