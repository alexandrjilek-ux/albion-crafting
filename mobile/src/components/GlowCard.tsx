// GlowCard — generický card container s aura aurou (radial-style glow,
// imitovaný shadowem). Mockup používá `linear-gradient + radial-gradient
// pseudo-element`. RN nemá radial gradient bez RN-SVG, takže fakeujeme:
// barevný shadow + soft top tint přes overlay <View>.
//
// Variant:
//   - "arcane"  : arcane violet glow (hero card, champion podium #1)
//   - "frost"   : frost cyan glow (profit numbers, CTAs)
//   - "rose"    : rose tint (secondary glow zone)
//   - "neutral" : surface1 + standard line border, žádný glow

import { ReactNode } from 'react';
import { StyleSheet, View, ViewProps, ViewStyle } from 'react-native';

import { colors, type AppColors } from '@theme/colors';
import { useTheme } from '@theme/ThemeProvider';
import { glow, radius, spacing } from '@theme/spacing';

export type GlowVariant = 'arcane' | 'frost' | 'rose' | 'neutral';

export interface GlowCardProps extends ViewProps {
  variant?: GlowVariant;
  children?: ReactNode;
  // Když je `padded={false}`, card nemá vnitřní padding — na list views.
  padded?: boolean;
}

export function GlowCard({
  variant = 'neutral',
  children,
  padded = true,
  style,
  ...rest
}: GlowCardProps) {
  const { colors: themeColors } = useTheme();
  styles = createStyles(themeColors);
  variantStyles = createVariantStyles(themeColors);
  auraStyles = createAuraStyles(themeColors);

  return (
    <View
      style={[styles.base, padded && styles.padded, variantStyles[variant], style]}
      {...rest}
    >
      {/* top-right radial-ish tint pomocí absolute View. Mockup
          .hero-card::before — jemný blob nahoře vpravo. */}
      {variant !== 'neutral' && <View pointerEvents="none" style={[styles.aura, auraStyles[variant]]} />}
      {children}
    </View>
  );
}

let styles = createStyles(colors);

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  base: {
    backgroundColor: colors.surface1,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    position: 'relative',
  },
  padded: {
    padding: spacing.lg,
  },
  aura: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    opacity: 0.7,
  },
  });
}

let variantStyles = createVariantStyles(colors);

function createVariantStyles(colors: AppColors): Record<GlowVariant, ViewStyle> {
  return {
    arcane: {
      borderColor: colors.arcaneSoft,
      ...glow.arcane,
      shadowColor: colors.arcane,
    },
    frost: {
      borderColor: colors.frostGlow,
      ...glow.frost,
      shadowColor: colors.frost,
    },
    rose: {
      borderColor: colors.roseSoft,
      ...glow.arcane,
      shadowColor: colors.rose,
    },
    neutral: {
      ...glow.card,
    },
  };
}

let auraStyles = createAuraStyles(colors);

function createAuraStyles(colors: AppColors): Record<GlowVariant, ViewStyle> {
  return {
    arcane: { backgroundColor: colors.arcaneGlow },
    frost: { backgroundColor: colors.frostGlow },
    rose: { backgroundColor: colors.roseSoft },
    neutral: { backgroundColor: 'transparent' },
  };
}
