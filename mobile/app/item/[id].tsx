// Item detail — modal route. Načte recipe, ceny ve všech royal cities a
// price history z backendu. Závisí na GET /items/{unique_name}.

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchItemDetail } from '../../src/api/itemDetail';
import type {
  CityHistory,
  CityPrice,
  ItemDetailResponse,
  MaterialPrices,
  Recipe,
} from '../../src/api/types';
import {
  FilterChips,
  GlowCard,
  PriceHistoryChart,
  SectionHeader,
  StatBadge,
} from '../../src/components';
import { useLanguage, type LanguageCode } from '../../src/i18n/LanguageProvider';
import { colors, type AppColors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeProvider';
import { glow, radius, spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import {
  albionItemIconUrl,
  formatSilver,
  formatTierCategory,
  shortCity,
} from '../../src/utils/format';

const COPY: Record<LanguageCode, {
  itemDetail: string;
  item: string;
  loading: string;
  priceHistory: string;
  lastDays: (days: number) => string;
  noTrades: (city: string, days: number) => string;
  itemPrices: string;
  itemPricesSubtitle: string;
  recipeMissing: string;
  recipeMissingBody: string;
  recipe: string;
  recipeSubtitle: (focusCost?: number | null, silverFee?: number | null) => string;
  materialsTitle: string;
  materialLine: (price: string, city: string | null) => string;
  unknownPrice: string;
  totalCheapest: string;
  detailUnavailable: string;
  retry: string;
}> = {
  cs: {
    itemDetail: 'Detail itemu',
    item: 'ITEM',
    loading: 'Stahuji recept, ceny a historii...',
    priceHistory: 'Cenova historie',
    lastDays: (days) => `Poslednich ${days} dnu - prumerna denni cena`,
    noTrades: (city, days) => `V ${city} zadne obchody za poslednich ${days} dni.`,
    itemPrices: 'Ceny itemu',
    itemPricesSubtitle: 'Per mesto - sell order vs buy order',
    recipeMissing: 'Recept nenalezen',
    recipeMissingBody: 'Tento item nejspis nema recept v Gameinfo API ani v ao-bin-dumps fallbacku. Ceny a historii si muzes stale zobrazit vyse.',
    recipe: 'Recept',
    recipeSubtitle: (focusCost, silverFee) =>
      focusCost ? `Focus: ${focusCost} · Silver fee: ${formatSilver(silverFee ?? 0)}` : 'Suroviny pro 1 craft',
    materialsTitle: 'Suroviny - ceny per mesto',
    materialLine: (price, city) => `${price} v ${city ?? '-'}`,
    unknownPrice: 'cena neznama',
    totalCheapest: 'Total (nejlevnejsi mesta)',
    detailUnavailable: 'Detail nedostupny',
    retry: 'Zkusit znovu',
  },
  en: {
    itemDetail: 'Item detail',
    item: 'ITEM',
    loading: 'Fetching recipe, prices and history...',
    priceHistory: 'Price history',
    lastDays: (days) => `Last ${days} days - average daily price`,
    noTrades: (city, days) => `No trades in ${city} during the last ${days} days.`,
    itemPrices: 'Item prices',
    itemPricesSubtitle: 'Per city - sell order vs buy order',
    recipeMissing: 'Recipe not found',
    recipeMissingBody: 'This item probably has no recipe in the Gameinfo API or ao-bin-dumps fallback. You can still view prices and history above.',
    recipe: 'Recipe',
    recipeSubtitle: (focusCost, silverFee) =>
      focusCost ? `Focus: ${focusCost} · Silver fee: ${formatSilver(silverFee ?? 0)}` : 'Materials for 1 craft',
    materialsTitle: 'Materials - prices per city',
    materialLine: (price, city) => `${price} in ${city ?? '-'}`,
    unknownPrice: 'unknown price',
    totalCheapest: 'Total (cheapest cities)',
    detailUnavailable: 'Detail unavailable',
    retry: 'Try again',
  },
};

export default function ItemDetailModal() {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const copy = COPY[language];
  styles = createStyles(themeColors);

  const { id } = useLocalSearchParams<{ id: string }>();
  const uniqueName = id ?? '';

  const [data, setData] = useState<ItemDetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Pro graf: výchozí Caerleon (highest volume = nejhustší history).
  const [chartCity, setChartCity] = useState<string>('Caerleon');

  const load = useCallback(async () => {
    if (!uniqueName) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchItemDetail(uniqueName, { historyDays: 14 });
      setData(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [uniqueName]);

  useEffect(() => {
    void load();
  }, [load]);

  const iconUrl = useMemo(
    () => data?.icon_url ?? albionItemIconUrl(uniqueName, { size: 217 }),
    [data?.icon_url, uniqueName],
  );

  const cityHistory = useMemo<CityHistory | undefined>(
    () => data?.history.find((h) => h.city === chartCity),
    [data?.history, chartCity],
  );

  return (
    <SafeAreaView edges={['top']} style={styles.canvas}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {data?.name ?? copy.itemDetail}
        </Text>
        <Pressable onPress={() => void load()} hitSlop={10} disabled={loading}>
          <Ionicons
            name="refresh"
            size={22}
            color={loading ? colors.textMuted : colors.textPrimary}
          />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {error ? (
          <ErrorBlock error={error} onRetry={load} />
        ) : null}

        {/* Hero header — icon + name + tier/category badges */}
        <View style={styles.hero}>
          <View style={styles.iconBox}>
            {iconUrl ? (
              <Image source={{ uri: iconUrl }} style={styles.iconImg} resizeMode="contain" />
            ) : (
              <Text style={{ fontSize: 56 }}>✦</Text>
            )}
          </View>
          <Text style={styles.eyebrow}>* {copy.item}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {data?.name ?? uniqueName}
          </Text>
          <View style={styles.tags}>
            {data?.tier ? <StatBadge label={`T${data.tier}`} tone="arcane" /> : null}
            {data?.enchant && data.enchant > 0 ? (
              <StatBadge label={`.${data.enchant}`} tone="rose" />
            ) : null}
            {data?.category ? (
              <StatBadge
                label={formatTierCategory(undefined, data.category) || data.category}
                tone="default"
              />
            ) : null}
          </View>
          <Text style={styles.uniqueId}>{uniqueName}</Text>
        </View>

        {loading && !data ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color={colors.arcane} />
            <Text style={styles.loadingHint}>{copy.loading}</Text>
          </View>
        ) : null}

        {data?.warning ? (
          <View style={styles.warningBlock}>
            <Text style={styles.warningText}>{data.warning}</Text>
          </View>
        ) : null}

        {/* Best price summary — KPI strip, kde prodat / koupit */}
        {data ? <BestPricesStrip itemPrices={data.item_prices} /> : null}

        {/* Price history graph */}
        {data && data.history.length > 0 ? (
          <>
            <SectionHeader
              title={copy.priceHistory}
              subtitle={copy.lastDays(data.history_days)}
            />
            <View style={styles.cityChipsRow}>
              <FilterChips
                items={data.history.map((h) => ({ value: h.city, label: shortCity(h.city) }))}
                active={chartCity}
                onChange={(v) => setChartCity(v)}
                activeTone="frost"
              />
            </View>
            <GlowCard variant="frost">
              <PriceHistoryChart
                history={cityHistory?.points ?? []}
                color={colors.frost}
                height={120}
                emptyHint={copy.noTrades(chartCity, data.history_days)}
              />
            </GlowCard>
          </>
        ) : null}

        {/* Item prices per city */}
        {data && data.item_prices.length > 0 ? (
          <>
            <SectionHeader
              title={copy.itemPrices}
              subtitle={copy.itemPricesSubtitle}
            />
            <GlowCard padded={false}>
              <PriceTableHeader />
              {data.item_prices.map((p, idx) => (
                <PriceRow
                  key={`item-${p.city}`}
                  price={p}
                  isLast={idx === data.item_prices.length - 1}
                />
              ))}
            </GlowCard>
          </>
        ) : null}

        {/* Recipe section */}
        {data?.recipe ? (
          <RecipeSection
            recipe={data.recipe}
            materialPrices={data.material_prices}
          />
        ) : data ? (
          <GlowCard variant="rose" style={{ marginTop: spacing.lg }}>
            <Text style={styles.warningTitle}>{copy.recipeMissing}</Text>
            <Text style={styles.body}>{copy.recipeMissingBody}</Text>
          </GlowCard>
        ) : null}

        {/* Bottom safe-area space pro modal */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── helper components ─────────────────────────────────────────────────

function BestPricesStrip({ itemPrices }: { itemPrices: CityPrice[] }) {
  // Best place to sell = max sell_min (chceš co nejvyšší cenu za který lidi
  // shopnou tvůj sell order). Best place to buy = min sell_min (kup co
  // nejlevněji od cizího sell orderu). Ignore null/0 ceny.
  const valid = itemPrices.filter((p) => p.sell_min > 0);
  if (valid.length === 0) {
    return (
      <GlowCard style={{ marginTop: spacing.base }}>
        <Text style={styles.body}>
          Žádná aktuální cena — AODP buď nemá data, nebo se item neobchoduje.
        </Text>
      </GlowCard>
    );
  }
  const bestSell = valid.reduce((best, p) => (p.sell_min > best.sell_min ? p : best));
  const bestBuy = valid.reduce((best, p) => (p.sell_min < best.sell_min ? p : best));

  return (
    <View style={styles.kpiRow}>
      <GlowCard variant="frost" style={styles.kpi}>
        <Text style={styles.kpiLabel}>NEJDRÁŽ PRODÁŠ</Text>
        <Text style={[styles.kpiValue, { color: colors.frost }]}>
          {formatSilver(bestSell.sell_min)}
        </Text>
        <Text style={styles.kpiSub}>{bestSell.city}</Text>
      </GlowCard>
      <GlowCard variant="arcane" style={styles.kpi}>
        <Text style={styles.kpiLabel}>NEJLEVNĚJŠÍ KUP</Text>
        <Text style={[styles.kpiValue, { color: colors.arcane }]}>
          {formatSilver(bestBuy.sell_min)}
        </Text>
        <Text style={styles.kpiSub}>{bestBuy.city}</Text>
      </GlowCard>
    </View>
  );
}

function PriceTableHeader() {
  return (
    <View style={[styles.row, styles.rowHead]}>
      <Text style={[styles.cellCity, styles.cellHead]}>Město</Text>
      <Text style={[styles.cellNum, styles.cellHead]}>Sell min</Text>
      <Text style={[styles.cellNum, styles.cellHead]}>Buy max</Text>
    </View>
  );
}

function PriceRow({ price, isLast }: { price: CityPrice; isLast: boolean }) {
  const hasSell = price.sell_min > 0;
  const hasBuy = price.buy_max > 0;
  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <Text style={styles.cellCity}>{price.city}</Text>
      <Text style={[styles.cellNum, !hasSell && styles.cellMuted]}>
        {hasSell ? formatSilver(price.sell_min) : '—'}
      </Text>
      <Text style={[styles.cellNum, !hasBuy && styles.cellMuted]}>
        {hasBuy ? formatSilver(price.buy_max) : '—'}
      </Text>
    </View>
  );
}

function RecipeSection({
  recipe,
  materialPrices,
}: {
  recipe: Recipe;
  materialPrices: MaterialPrices[];
}) {
  const { language } = useLanguage();
  const copy = COPY[language];
  // Spočítáme orientační total cost (1 craft) jako sum(min(sell_min) per
  // material × count). Min přes všechna města — předpokládáme, že hráč
  // koupí v nejlevnějším.
  const totalCost = materialPrices.reduce((sum, mp) => {
    const valid = mp.prices.filter((p) => p.sell_min > 0);
    if (valid.length === 0) return sum;
    const minPrice = Math.min(...valid.map((p) => p.sell_min));
    return sum + minPrice * mp.count;
  }, 0);

  return (
    <>
      <SectionHeader
        title={copy.recipe}
        subtitle={copy.recipeSubtitle(recipe.focus_cost, recipe.silver_fee)}
      />
      <GlowCard padded={false}>
        {recipe.materials.map((mat, idx) => {
          const mp = materialPrices.find((m) => m.unique_name === mat.unique_name);
          const valid = mp?.prices.filter((p) => p.sell_min > 0) ?? [];
          const minPrice =
            valid.length > 0 ? Math.min(...valid.map((p) => p.sell_min)) : 0;
          const subtotal = minPrice * mat.count;
          const cheapestCity =
            valid.length > 0
              ? valid.reduce((b, p) => (p.sell_min < b.sell_min ? p : b)).city
              : null;

          const isLast = idx === recipe.materials.length - 1;

          return (
            <View
              key={mat.unique_name}
              style={[styles.matRow, !isLast && styles.rowDivider]}
            >
              <View style={styles.matIconBox}>
                <Image
                  source={{ uri: albionItemIconUrl(mat.unique_name, { size: 64 }) ?? '' }}
                  style={styles.matIconImg}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.matMeta}>
                <Text style={styles.matName} numberOfLines={1}>
                  {mat.name}
                </Text>
                <Text style={styles.matSub}>
                  {mat.count}× ·{' '}
                  {minPrice > 0
                    ? copy.materialLine(formatSilver(minPrice), cheapestCity)
                    : copy.unknownPrice}
                </Text>
              </View>
              <Text style={styles.matSubtotal}>
                {subtotal > 0 ? formatSilver(subtotal) : '—'}
              </Text>
            </View>
          );
        })}
        {totalCost > 0 ? (
          <View style={[styles.matRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>{copy.totalCheapest}</Text>
            <Text style={styles.totalValue}>{formatSilver(totalCost)}</Text>
          </View>
        ) : null}
      </GlowCard>

      {/* Material prices breakdown — ceny každé suroviny per city */}
      <SectionHeader title={copy.materialsTitle} />
      {materialPrices.map((mp) => (
        <View key={mp.unique_name} style={{ marginTop: spacing.sm }}>
          <Text style={styles.matHeader}>
            {mp.name} <Text style={styles.matHeaderSub}>×{mp.count}</Text>
          </Text>
          <GlowCard padded={false}>
            <PriceTableHeader />
            {mp.prices.map((p, idx) => (
              <PriceRow
                key={`${mp.unique_name}-${p.city}`}
                price={p}
                isLast={idx === mp.prices.length - 1}
              />
            ))}
          </GlowCard>
        </View>
      ))}
    </>
  );
}

function ErrorBlock({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { language } = useLanguage();
  const copy = COPY[language];
  return (
    <GlowCard variant="rose" style={{ marginBottom: spacing.lg }}>
      <Text style={styles.warningTitle}>{copy.detailUnavailable}</Text>
      <Text style={styles.body}>{error}</Text>
      <Pressable onPress={onRetry} hitSlop={10} style={{ marginTop: spacing.sm }}>
        <Text style={styles.retryText}>{copy.retry}</Text>
      </Pressable>
    </GlowCard>
  );
}

// ─── styles ────────────────────────────────────────────────────────────

let styles = createStyles(colors);

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.bgCanvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: spacing.md,
  },
  headerTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  content: { padding: spacing.base },

  // Hero header
  hero: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  iconBox: {
    width: 140,
    height: 140,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...glow.arcane,
    shadowOpacity: 0.4,
  },
  iconImg: { width: 110, height: 110 },
  eyebrow: { ...typography.eyebrow, color: colors.arcane, marginBottom: spacing.xs },
  title: {
    ...typography.detailH2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  tags: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'center' },
  uniqueId: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: spacing.xs,
    fontFamily: 'Courier',
  },

  // Loading
  loadingBlock: { padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  loadingHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },

  // KPI strip
  kpiRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.base,
  },
  kpi: { flex: 1, padding: spacing.base - 2 },
  kpiLabel: {
    ...typography.captionStrong,
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 1.0,
  },
  kpiValue: {
    ...typography.kpiValue,
    color: colors.textPrimary,
    fontSize: 20,
    marginTop: 4,
  },
  kpiSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // City chips for chart
  cityChipsRow: {
    marginBottom: spacing.sm,
  },

  // Price table
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  rowHead: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  cellCity: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  cellNum: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    width: 90,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  cellHead: {
    ...typography.captionStrong,
    color: colors.textMuted,
    fontSize: 10,
  },
  cellMuted: {
    color: colors.textMuted,
    fontWeight: '400',
  },

  // Recipe materials
  matRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  matIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(167,139,250,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matIconImg: { width: 36, height: 36 },
  matMeta: { flex: 1 },
  matName: { ...typography.bodyStrong, color: colors.textPrimary },
  matSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  matSubtotal: {
    ...typography.bodyStrong,
    color: colors.frost,
    fontVariant: ['tabular-nums'],
    width: 90,
    textAlign: 'right',
  },
  totalRow: {
    backgroundColor: 'rgba(103,232,249,0.06)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  totalLabel: {
    ...typography.captionStrong,
    color: colors.textSecondary,
    flex: 1,
  },
  totalValue: {
    ...typography.kpiValue,
    color: colors.frost,
    fontSize: 18,
  },

  matHeader: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  matHeaderSub: { color: colors.textMuted, fontWeight: '400' },

  // Warnings / errors
  warningBlock: {
    marginBottom: spacing.base,
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderRadius: radius.base,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.30)',
  },
  warningText: { ...typography.caption, color: colors.amber },
  warningTitle: {
    ...typography.heroTitle,
    color: colors.rose,
    marginBottom: spacing.xs,
  },

  body: { ...typography.body, color: colors.textPrimary, lineHeight: 20 },
  retryText: {
    ...typography.bodyStrong,
    color: colors.frost,
    fontWeight: '700',
  },
  });
}
