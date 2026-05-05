// Leaderboard row z mockupu â€” `.item-row` (iPhone) / `.lb-row` (iPad).
// Rank, ikona, nĂˇzev + meta, profit, %.

import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, type AppColors } from '@theme/colors';
import { useTheme } from '@theme/ThemeProvider';
import { radius, spacing } from '@theme/spacing';
import { typography } from '@theme/typography';
import {
  albionItemIconUrl,
  categoryEmoji,
  formatPercent,
  formatProfit,
  formatRoute,
  formatSilverCompact,
  freshnessColor,
  freshnessFromVolume,
} from '@utils/format';
import type { TopItemRow } from '@api/types';

export interface ItemRowProps {
  item: TopItemRow;
  rank: number;
  onPress?: (item: TopItemRow) => void;
  // Extra-tight varianta pro iPad three-pane (uĹľĹˇĂ­ stĹ™ednĂ­ sloupec).
  compact?: boolean;
  isLast?: boolean;
}

export function ItemRow({ item, rank, onPress, compact = false, isLast = false }: ItemRowProps) {
  const { colors: themeColors } = useTheme();
  styles = createStyles(themeColors);

  const profit = pickProfit(item);
  const noFocusProfit = pickNoFocusProfit(item);
  const margin = pickMargin(item);
  const dailyVol = pickVolume(item);
  const freshness = freshnessFromVolume(dailyVol);
  const confidence = typeof item.confidence_score === 'number' ? item.confidence_score : undefined;
  const riskLabel = confidence !== undefined ? `${Math.round(confidence * 100)}%` : null;
  const routeLabel = formatRoute(item.craft_city, item.sell_city);
  const craftsWithFocus =
    (item.crafts_with_focus as number | undefined) ??
    (item.batch_size as number | undefined) ??
    (item.sellable_crafts_estimate as number | undefined);
  const metaLabel = compact
    ? routeLabel
    : `T${item.tier ?? '-'} - ${routeLabel} - ${craftsWithFocus ?? 0} crafts${riskLabel ? ` - ${riskLabel}` : ''}`;
  const iconUrl = albionItemIconUrl(item.item_id as string | undefined, { size: 64 });
  const [iconErr, setIconErr] = useState(false);

  return (
    <Pressable
      onPress={onPress ? () => onPress(item) : undefined}
      style={({ pressed }) => [
        styles.row,
        isLast ? null : styles.rowDivider,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.rank}>{rank.toString().padStart(2, '0')}</Text>
      <View style={styles.icon}>
        {iconUrl && !iconErr ? (
          <Image
            source={{ uri: iconUrl }}
            style={styles.iconImage}
            onError={() => setIconErr(true)}
            resizeMode="contain"
          />
        ) : (
          <Text style={styles.iconEmoji}>{categoryEmoji(item.category)}</Text>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {(item.name_en as string | undefined) ?? (item.item_id as string | undefined) ?? 'Unknown item'}
        </Text>
        <View style={styles.meta}>
          <View style={[styles.dot, { backgroundColor: freshnessColor(freshness) }]} />
          <Text style={styles.metaText} numberOfLines={1}>
            {metaLabel}
          </Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.profit}>{formatProfit(profit)}</Text>
        <Text style={styles.percent}>no focus {formatSilverCompact(noFocusProfit)}</Text>
        <Text style={styles.percent}>{formatPercent(margin)}</Text>
      </View>
    </Pressable>
  );
}

// Engine vracĂ­ silver_per_focus / profit_focus / profit_no_focus / expected_profit
// â€” pick nejvhodnÄ›jĹˇĂ­ dostupnĂ©. Fallback na `expected_profit`.
function pickProfit(item: TopItemRow): number | undefined {
  return (
    (item.profit_focus_conservative as number | undefined) ??
    (item.profit_focus as number | undefined) ??
    (item.expected_profit as number | undefined) ??
    (item.profit_no_focus_conservative as number | undefined) ??
    (item.profit_no_focus as number | undefined) ??
    (item.silver_per_focus_conservative as number | undefined) ??
    (item.silver_per_focus as number | undefined)
  );
}

function pickMargin(item: TopItemRow): number | undefined {
  return (
    (item['margin_focus_%'] as number | undefined) ??
    (item.margin_focus as number | undefined)
  );
}

function pickNoFocusProfit(item: TopItemRow): number | undefined {
  return (
    (item.profit_no_focus_conservative as number | undefined) ??
    (item.profit_no_focus as number | undefined)
  );
}

function pickVolume(item: TopItemRow): number | undefined {
  return (
    (item.daily_volume as number | undefined) ??
    (item.avg_daily_volume as number | undefined) ??
    undefined
  );
}

let styles = createStyles(colors);

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base - 2,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  pressed: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  rank: {
    ...typography.captionStrong,
    color: colors.textMuted,
    width: 28,
    textAlign: 'center',
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 16,
  },
  iconImage: {
    width: 28,
    height: 28,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metaText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  right: {
    alignItems: 'flex-end',
  },
  profit: {
    ...typography.profit,
    color: colors.frost,
  },
  percent: {
    ...typography.caption,
    color: colors.textMuted,
  },
  });
}
