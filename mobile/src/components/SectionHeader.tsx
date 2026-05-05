// Section title ("PODIUM · Top 3 dnes" + "Žebříček ›") z mockupu.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, type AppColors } from '@theme/colors';
import { useTheme } from '@theme/ThemeProvider';
import { spacing } from '@theme/spacing';
import { typography } from '@theme/typography';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onActionPress }: SectionHeaderProps) {
  const { colors: themeColors } = useTheme();
  styles = createStyles(themeColors);

  return (
    <View style={styles.row}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel ? (
        <Pressable onPress={onActionPress} hitSlop={8}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

let styles = createStyles(colors);

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm + 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    flex: 1,
  },
  title: {
    ...typography.sectionLabel,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.captionStrong,
    color: colors.textMuted,
    fontWeight: '600',
  },
  action: {
    ...typography.caption,
    color: colors.frost,
    fontWeight: '600',
  },
  });
}
