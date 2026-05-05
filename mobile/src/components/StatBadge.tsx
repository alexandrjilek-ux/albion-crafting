// Tag chip — odpovídá `.tag`, `.tag.pos`, `.tag.gold` z mockupu.
// Použití: filter chips (city, mode), hero meta badges, item meta dots.

import { Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

import { colors, type AppColors } from '@theme/colors';
import { useTheme } from '@theme/ThemeProvider';
import { radius, spacing } from '@theme/spacing';
import { typography } from '@theme/typography';

export type BadgeTone = 'default' | 'arcane' | 'frost' | 'rose' | 'amber' | 'crimson';

export interface StatBadgeProps {
  label: string;
  tone?: BadgeTone;
  // Plně proklikávací? Optional onPress.
  onPress?: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

let toneBg = createToneBg(colors);
let toneBorder = createToneBorder(colors);
let toneFg = createToneFg(colors);

export function StatBadge({ label, tone = 'default', onPress, style, textStyle }: StatBadgeProps) {
  const { colors: themeColors } = useTheme();
  styles = createStyles(themeColors);
  toneBg = createToneBg(themeColors);
  toneBorder = createToneBorder(themeColors);
  toneFg = createToneFg(themeColors);

  const containerStyle = [
    styles.badge,
    {
      backgroundColor: toneBg[tone],
      borderColor: toneBorder[tone],
    },
    style,
  ];

  const inner = (
    <Text style={[styles.text, { color: toneFg[tone] }, textStyle]} numberOfLines={1}>
      {label}
    </Text>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [containerStyle, pressed && { opacity: 0.7 }]}
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={containerStyle}>{inner}</View>;
}

function createToneBg(colors: AppColors): Record<BadgeTone, string> {
  return {
    default: colors.tagBg,
    arcane: colors.arcaneSoft,
    frost: colors.frostSoft,
    rose: colors.roseSoft,
    amber: 'rgba(245,158,11,0.10)',
    crimson: 'rgba(239,68,68,0.10)',
  };
}

function createToneBorder(colors: AppColors): Record<BadgeTone, string> {
  return {
    default: colors.line,
    arcane: colors.arcaneGlow,
    frost: colors.frostGlow,
    rose: colors.roseSoft,
    amber: 'rgba(245,158,11,0.25)',
    crimson: 'rgba(239,68,68,0.25)',
  };
}

function createToneFg(colors: AppColors): Record<BadgeTone, string> {
  return {
    default: colors.textSecondary,
    arcane: colors.arcane,
    frost: colors.frost,
    rose: colors.rose,
    amber: colors.amber,
    crimson: colors.crimson,
  };
}

let styles = createStyles(colors);

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  text: {
    ...typography.captionStrong,
    fontSize: 11,
  },
  });
}
