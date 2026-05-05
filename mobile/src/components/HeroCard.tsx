import { StyleSheet, Text, View } from 'react-native';

import { GlowCard } from './GlowCard';
import { StatBadge } from './StatBadge';
import { colors, type AppColors } from '@theme/colors';
import { useLanguage } from '../i18n/LanguageProvider';
import { useTheme } from '@theme/ThemeProvider';
import { spacing } from '@theme/spacing';
import { typography } from '@theme/typography';
import {
  formatPercent,
  formatRoute,
  formatSilver,
  formatSilverCompact,
} from '@utils/format';
import type { TopItemRow } from '@api/types';

export interface HeroCardProps {
  item: TopItemRow | undefined;
  eyebrow?: string;
  loading?: boolean;
}

export function HeroCard({ item, eyebrow, loading = false }: HeroCardProps) {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const copy = language === 'en'
    ? {
        eyebrow: '* DAILY BEST',
        loading: 'Loading...',
        noData: 'No data',
        unit: 'silver / craft',
        noFocus: 'No focus',
        crafts: 'crafts',
        day: 'Day',
        margin: 'margin',
        confidence: 'confidence',
      }
    : {
        eyebrow: '* DAILY BEST',
        loading: 'Nacitam...',
        noData: 'Zadna data',
        unit: 'silver / craft',
        noFocus: 'Bez focusu',
        crafts: 'crafts',
        day: 'Den',
        margin: 'margin',
        confidence: 'jistota',
      };
  const eyebrowText = eyebrow ?? copy.eyebrow;
  styles = createStyles(themeColors);

  if (loading || !item) {
    return (
      <GlowCard variant="arcane">
        <Text style={styles.eyebrow}>{eyebrowText}</Text>
        <Text style={styles.title}>{loading ? copy.loading : copy.noData}</Text>
        <View style={styles.statRow}>
          <Text style={styles.number}>-</Text>
        </View>
      </GlowCard>
    );
  }

  const profit =
    (item.profit_focus_conservative as number | undefined) ??
    (item.profit_focus as number | undefined) ??
    (item.expected_profit as number | undefined);
  const noFocusProfit =
    (item.profit_no_focus_conservative as number | undefined) ??
    (item.profit_no_focus as number | undefined);
  const craftsWithFocus =
    (item.crafts_with_focus as number | undefined) ??
    (item.batch_size as number | undefined) ??
    (item.sellable_crafts_estimate as number | undefined);
  const dailyProfit =
    (item._daily_profit as number | undefined) ??
    (item.risk_adjusted_daily_profit as number | undefined);
  const margin = (item['margin_focus_%'] as number | undefined);
  const confidence = typeof item.confidence_score === 'number' ? item.confidence_score : undefined;

  return (
    <GlowCard variant="arcane">
      <Text style={styles.eyebrow}>{eyebrowText}</Text>
      <Text style={styles.title} numberOfLines={2}>
        {(item.name_en as string | undefined) ?? (item.item_id as string | undefined) ?? 'Unknown item'}
      </Text>
      <View style={styles.statRow}>
        <Text style={styles.number}>{formatSilver(profit)}</Text>
        <Text style={styles.unit}>{copy.unit}</Text>
      </View>
      <View style={styles.focusRow}>
        <Text style={styles.focusMetric}>{copy.noFocus} {formatSilverCompact(noFocusProfit)}</Text>
        <Text style={styles.focusMetric}>{craftsWithFocus ?? 0} {copy.crafts}</Text>
        <Text style={styles.focusMetric}>{copy.day} {formatSilverCompact(dailyProfit)}</Text>
      </View>
      <View style={styles.metaRow}>
        {margin !== undefined && <StatBadge label={`+ ${formatPercent(margin)} ${copy.margin}`} tone="frost" />}
        {confidence !== undefined && <StatBadge label={`${Math.round(confidence * 100)}% ${copy.confidence}`} tone={confidence >= 0.8 ? 'frost' : 'default'} />}
        {item.tier !== undefined && <StatBadge label={`T${item.tier}`} tone="arcane" />}
        <StatBadge label={formatRoute(item.craft_city, item.sell_city, language)} tone="default" />
      </View>
    </GlowCard>
  );
}

let styles = createStyles(colors);

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  eyebrow: {
    ...typography.eyebrow,
    color: colors.arcane,
  },
  title: {
    ...typography.heroTitle,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  number: {
    ...typography.heroNumber,
    color: colors.arcane,
    textShadowColor: 'rgba(167,139,250,0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  unit: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: spacing.md,
  },
  focusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  focusMetric: {
    ...typography.captionStrong,
    color: colors.textSecondary,
  },
  });
}
