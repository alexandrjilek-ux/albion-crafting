// Podium z mockupu — top 3 itemy ve 3 sloupcích, prostřední (gold/champion)
// je vyšší a širší (1 / 1.15 / 1 grid). RN nemá CSS grid, takže fakeujeme
// flex: 1 / 1.15 / 1 přes flexBasis.

import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, type AppColors } from '@theme/colors';
import { useTheme } from '@theme/ThemeProvider';
import { glow, radius, spacing } from '@theme/spacing';
import { typography } from '@theme/typography';
import {
  albionItemIconUrl,
  categoryEmoji,
  formatProfit,
} from '@utils/format';
import type { TopItemRow } from '@api/types';

export interface ChampionPodiumProps {
  items: TopItemRow[]; // očekáváme 0–3 itemy, max 3 použijeme
  onPressItem?: (item: TopItemRow, rank: 1 | 2 | 3) => void;
}

export function ChampionPodium({ items, onPressItem }: ChampionPodiumProps) {
  const { colors: themeColors } = useTheme();
  styles = createStyles(themeColors);

  const [first, second, third] = items;

  return (
    <View style={styles.row}>
      {/* #2 silver */}
      <PodiumStep
        rank={2}
        item={second}
        onPress={second && onPressItem ? () => onPressItem(second, 2) : undefined}
      />
      {/* #1 champion (vyšší) */}
      <PodiumStep
        rank={1}
        champion
        item={first}
        onPress={first && onPressItem ? () => onPressItem(first, 1) : undefined}
      />
      {/* #3 bronze */}
      <PodiumStep
        rank={3}
        item={third}
        onPress={third && onPressItem ? () => onPressItem(third, 3) : undefined}
      />
    </View>
  );
}

interface StepProps {
  rank: 1 | 2 | 3;
  item: TopItemRow | undefined;
  champion?: boolean;
  onPress?: () => void;
}

function PodiumStep({ rank, item, champion = false, onPress }: StepProps) {
  const { colors: themeColors } = useTheme();
  styles = createStyles(themeColors);

  const rankColor = rank === 1 ? themeColors.arcane : rank === 2 ? themeColors.silver : themeColors.bronze;
  const flexBasis = champion ? 1.15 : 1;
  const iconUrl = albionItemIconUrl(item?.item_id as string | undefined, {
    size: champion ? 217 : 128,
  });
  const [iconErr, setIconErr] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.step,
        champion ? styles.stepChampion : null,
        rank === 2 ? styles.stepSilver : null,
        rank === 3 ? styles.stepBronze : null,
        { flex: flexBasis },
        pressed ? styles.stepPressed : null,
      ]}
    >
      <Text style={[styles.rank, { color: rankColor }]} numberOfLines={1}>
        {rank === 1 ? '#1 · Champion' : `#${rank}`}
      </Text>
      <View style={[styles.iconBox, champion && styles.iconBoxChampion]}>
        {iconUrl && !iconErr ? (
          <Image
            source={{ uri: iconUrl }}
            style={champion ? styles.iconImageChampion : styles.iconImage}
            onError={() => setIconErr(true)}
            resizeMode="contain"
          />
        ) : (
          <Text style={styles.iconEmoji}>{categoryEmoji(item?.category)}</Text>
        )}
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {(item?.name_en as string | undefined) ?? (item?.item_id as string | undefined) ?? '—'}
      </Text>
      <Text style={styles.profit} numberOfLines={1}>
        {formatProfit(
          (item?.profit_focus as number | undefined) ??
            (item?.expected_profit as number | undefined),
        )}
      </Text>
    </Pressable>
  );
}

let styles = createStyles(colors);

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  step: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    overflow: 'hidden',
  },
  stepChampion: {
    backgroundColor: 'rgba(167,139,250,0.12)', // base, top tint je decorace
    borderColor: 'rgba(167,139,250,0.35)',
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg - 2,
    ...glow.arcane,
    shadowOpacity: 0.4,
    shadowRadius: 22,
  },
  stepSilver: {
    backgroundColor: 'rgba(216,221,226,0.08)',
    borderColor: 'rgba(216,221,226,0.25)',
  },
  stepBronze: {
    backgroundColor: 'rgba(210,136,79,0.10)',
    borderColor: 'rgba(210,136,79,0.30)',
  },
  stepPressed: {
    opacity: 0.85,
  },
  rank: {
    ...typography.captionStrong,
    fontSize: 10,
    letterSpacing: 1.8,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: radius.base,
    backgroundColor: colors.surface3,
    marginVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxChampion: {
    backgroundColor: 'rgba(167,139,250,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.30)',
  },
  iconEmoji: {
    fontSize: 22,
  },
  iconImage: {
    width: 44,
    height: 44,
  },
  iconImageChampion: {
    width: 64,
    height: 64,
  },
  name: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
  },
  profit: {
    ...typography.profit,
    color: colors.frost,
    marginTop: spacing.xs + 2,
  },
  });
}
