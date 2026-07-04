import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLanguage, type LanguageCode } from '../i18n/LanguageProvider';
import type { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { glow, radius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { usePremium } from './PremiumProvider';

const COPY: Record<LanguageCode, {
  title: string;
  subtitle: string;
  lifetime: string;
  priceFallback: string;
  restore: string;
  restoring: string;
  buying: string;
  trialEnded: string;
  productHint: string;
}> = {
  cs: {
    title: 'Trial skončil',
    subtitle: 'Odemkni lifetime full verzi a pokračuj v craft, refine a transport analýzách bez limitu.',
    lifetime: 'Odemknout lifetime',
    priceFallback: 'jednorázově',
    restore: 'Obnovit nákup',
    restoring: 'Obnovuji...',
    buying: 'Otevírám App Store...',
    trialEnded: '7denní zkušební období je u konce.',
    productHint: 'Produkt musí být založený v App Store Connect jako non-consumable.',
  },
  en: {
    title: 'Trial ended',
    subtitle: 'Unlock lifetime full access and keep using craft, refine and transport analysis without limits.',
    lifetime: 'Unlock lifetime',
    priceFallback: 'one-time',
    restore: 'Restore purchase',
    restoring: 'Restoring...',
    buying: 'Opening App Store...',
    trialEnded: 'Your 7-day trial is over.',
    productHint: 'Create this product in App Store Connect as a non-consumable.',
  },
};

export function PremiumGate() {
  const premium = usePremium();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const copy = COPY[language];

  if (premium.isLoading || premium.isUnlocked) return null;

  const purchaseLabel = premium.purchaseInProgress
    ? copy.buying
    : `${copy.lifetime} · ${premium.lifetimePrice ?? copy.priceFallback}`;

  return (
    <View style={styles.overlay}>
      <View style={styles.panel}>
        <View style={styles.iconBadge}>
          <Ionicons name="sparkles" size={26} color={colors.arcane} />
        </View>
        <Text style={styles.kicker}>{copy.trialEnded}</Text>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.subtitle}>{copy.subtitle}</Text>

        <Pressable
          onPress={premium.purchaseLifetimeAccess}
          disabled={premium.purchaseInProgress}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
            premium.purchaseInProgress && styles.disabled,
          ]}
        >
          {premium.purchaseInProgress ? (
            <ActivityIndicator color={colors.bgCanvas} />
          ) : (
            <Ionicons name="lock-open" size={18} color={colors.bgCanvas} />
          )}
          <Text style={styles.primaryButtonText}>{purchaseLabel}</Text>
        </Pressable>

        <Pressable
          onPress={premium.restorePurchases}
          disabled={premium.restoreInProgress}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
        >
          {premium.restoreInProgress ? (
            <ActivityIndicator color={colors.frost} />
          ) : (
            <Ionicons name="refresh" size={17} color={colors.frost} />
          )}
          <Text style={styles.secondaryButtonText}>
            {premium.restoreInProgress ? copy.restoring : copy.restore}
          </Text>
        </Pressable>

        {premium.error ? <Text style={styles.error}>{premium.error}</Text> : null}
        {!premium.productLoaded ? (
          <Text style={styles.productHint}>{copy.productHint}</Text>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: AppColors, topInset: number) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 20,
      elevation: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.base,
      paddingTop: topInset + spacing.base,
      backgroundColor: colors.bgCanvas,
    },
    panel: {
      width: '100%',
      maxWidth: 440,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.arcaneGlow,
      backgroundColor: colors.surface1,
      padding: spacing.xl,
      alignItems: 'stretch',
      ...glow.card,
    },
    iconBadge: {
      width: 54,
      height: 54,
      borderRadius: radius.base,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.arcaneSoft,
      borderWidth: 1,
      borderColor: colors.arcaneGlow,
      marginBottom: spacing.lg,
    },
    kicker: {
      ...typography.captionStrong,
      color: colors.frost,
      textTransform: 'uppercase' as const,
      marginBottom: spacing.xs,
    },
    title: {
      ...typography.ipadH1,
      color: colors.textPrimary,
      fontSize: 30,
    },
    subtitle: {
      ...typography.body,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      marginBottom: spacing.xl,
    },
    primaryButton: {
      minHeight: 50,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.base,
      backgroundColor: colors.arcane,
      ...glow.arcane,
    },
    primaryButtonText: {
      ...typography.bodyStrong,
      color: colors.bgCanvas,
      textAlign: 'center',
    },
    secondaryButton: {
      minHeight: 46,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.base,
      borderWidth: 1,
      borderColor: colors.frostGlow,
      backgroundColor: colors.frostSoft,
      marginTop: spacing.md,
    },
    secondaryButtonText: {
      ...typography.bodyStrong,
      color: colors.frost,
      textAlign: 'center',
    },
    buttonPressed: { opacity: 0.82 },
    disabled: { opacity: 0.7 },
    error: {
      ...typography.caption,
      color: colors.crimson,
      marginTop: spacing.md,
      textAlign: 'center',
    },
    productHint: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: spacing.md,
      textAlign: 'center',
    },
  });
}

