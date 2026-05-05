// PriceHistoryChart — kompaktní bar-chart sparkline pro AODP price history.
// Záměrně nepoužívá react-native-svg (nechtěl jsem přidávat další dependency
// jen kvůli jednomu grafu). Každý datapoint = vertikální `View` s height
// proporcionální k ceně. Funguje pro 7–30 datapointů; pro víc bych už chtěl
// SVG.
//
// Props:
//   - history: HistoryPoint[]  — datapoints chronologicky
//   - height?: number          — výška grafu v px (default 100)
//   - color?: string           — barva barů
//   - emptyHint?: string       — co zobrazit, pokud history je prázdná

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { HistoryPoint } from '@api/types';
import { colors, type AppColors } from '@theme/colors';
import { useLanguage } from '../i18n/LanguageProvider';
import { useTheme } from '@theme/ThemeProvider';
import { radius, spacing } from '@theme/spacing';
import { typography } from '@theme/typography';
import { formatSilver } from '@utils/format';

export interface PriceHistoryChartProps {
  history: HistoryPoint[];
  height?: number;
  color?: string;
  emptyHint?: string;
}

export function PriceHistoryChart({
  history,
  height = 100,
  color = colors.frost,
  emptyHint,
}: PriceHistoryChartProps) {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const copy = language === 'en'
    ? { empty: 'No history for this city.', current: 'Current', trend: 'Trend', price: 'Price', volume: 'Volume' }
    : { empty: 'Zadna historie pro toto mesto.', current: 'Aktualne', trend: 'Trend', price: 'Cena', volume: 'Volume' };
  const styles = createStyles(themeColors);

  // Vyfiltruj nuly — AODP občas vrací datapoint s avg_price=0 pro dny bez
  // obchodu. Bez filtrace se min/max rozjede a graf vypadá rozbitě.
  const points = history.filter((p) => p.avg_price > 0);
  const [selectedIndex, setSelectedIndex] = useState(Math.max(points.length - 1, 0));

  if (points.length === 0) {
    return (
      <View style={[styles.empty, { minHeight: height }]}>
        <Text style={styles.emptyText}>{emptyHint ?? copy.empty}</Text>
      </View>
    );
  }

  const prices = points.map((p) => p.avg_price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(max - min, 1); // nedělíme nulou pokud je rovinka

  // Trend = +/-% mezi prvním a posledním platným datapointem.
  const first = prices[0]!;
  const last = prices[prices.length - 1]!;
  const trendPct = first > 0 ? ((last - first) / first) * 100 : 0;
  const trendColor = trendPct >= 0 ? themeColors.frost : themeColors.rose;
  const trendArrow = trendPct >= 0 ? '↑' : '↓';
  const selected = points[Math.min(selectedIndex, points.length - 1)] ?? points[points.length - 1]!;

  return (
    <View>
      <View style={styles.headerRow}>
        <View style={styles.priceCell}>
          <Text style={styles.label}>{copy.current}</Text>
          <Text style={styles.valueLg}>{formatSilver(last)}</Text>
        </View>
        <View style={styles.priceCell}>
          <Text style={styles.label}>Min ({points.length}d)</Text>
          <Text style={styles.value}>{formatSilver(min)}</Text>
        </View>
        <View style={styles.priceCell}>
          <Text style={styles.label}>Max ({points.length}d)</Text>
          <Text style={styles.value}>{formatSilver(max)}</Text>
        </View>
        <View style={styles.priceCell}>
          <Text style={styles.label}>{copy.trend}</Text>
          <Text style={[styles.value, { color: trendColor }]}>
            {trendArrow} {Math.abs(trendPct).toFixed(1)}%
          </Text>
        </View>
      </View>

      <View style={[styles.chart, { height }]}>
        {points.map((p, idx) => {
          // Min bar = 6px (jinak by úplné rovinka byla neviditelná).
          const ratio = (p.avg_price - min) / range;
          const barHeight = Math.max(6, ratio * (height - 12));
          // První a poslední datapoint zvýrazni — uživatel většinou hledá
          // "kolik to je teď vs. kolik to bylo kdysi".
          const isEdge = idx === 0 || idx === points.length - 1;
          const isSelected = selected === p;
          return (
            <Pressable
              key={`${p.date}-${idx}`}
              onPress={() => setSelectedIndex(idx)}
              style={styles.barHit}
              hitSlop={4}
            >
              <View
                style={[
                  styles.bar,
                  isSelected ? styles.barSelected : null,
                  {
                    height: barHeight,
                    backgroundColor: color,
                    opacity: isSelected || isEdge ? 1 : 0.55,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.selectedRow}>
        <Text style={styles.selectedText}>{formatShortDate(selected.date)}</Text>
        <Text style={styles.selectedText}>{copy.price} {formatSilver(selected.avg_price)}</Text>
        <Text style={styles.selectedText}>{copy.volume} {selected.item_count}</Text>
      </View>

      <View style={styles.dateRow}>
        <Text style={styles.dateText}>{formatShortDate(points[0]!.date)}</Text>
        <Text style={styles.dateText}>
          {formatShortDate(points[points.length - 1]!.date)}
        </Text>
      </View>
    </View>
  );
}

function formatShortDate(iso: string): string {
  // AODP vrací "2026-04-20T00:00:00" nebo s 'Z'. Vezmeme prvních 10 znaků
  // (YYYY-MM-DD), pak zformátujeme jako "20.04." (ČR style, krátké).
  if (!iso || iso.length < 10) return '—';
  const d = iso.slice(0, 10);
  const [, mm, dd] = d.split('-');
  if (!mm || !dd) return d;
  return `${dd}.${mm}.`;
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  priceCell: { flex: 1 },
  label: {
    ...typography.captionStrong,
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 1.0,
  },
  value: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 14,
    marginTop: 2,
  },
  valueLg: {
    ...typography.kpiValue,
    color: colors.frost,
    fontSize: 18,
    marginTop: 2,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: radius.base,
    paddingHorizontal: spacing.xs,
  },
  bar: {
    borderRadius: 2,
    minHeight: 4,
    width: '100%',
  },
  barHit: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barSelected: {
    borderWidth: 1,
    borderColor: colors.textPrimary,
  },
  selectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  selectedText: {
    ...typography.captionStrong,
    color: colors.textSecondary,
    fontSize: 10,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  dateText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: radius.base,
    padding: spacing.lg,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  });
}
