// Settings / About tab. Trvalou perzistenci jazyka připojíme až s i18n storem,
// aby se dnešní hardcoded texty nepřepínaly jen napůl.

import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_BASE_URL } from '../../src/api/client';
import { FilterChips, GlowCard, SectionHeader, StatBadge, ThemeToggle } from '../../src/components';
import { useLanguage, type LanguageCode } from '../../src/i18n/LanguageProvider';
import { PREMIUM_TRIAL_DAYS, usePremium } from '../../src/premium';
import { colors, type AppColors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius, spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

type RegionCode = 'europe' | 'america' | 'asia';
type PriceRegion = 'live' | 'west' | 'east';
type SchemeOption = 'dark' | 'light';

const LANGUAGE_FILTERS: ReadonlyArray<{ value: LanguageCode; label: string }> = [
  { value: 'cs', label: 'Čeština' },
  { value: 'en', label: 'English' },
];

const REGION_FILTERS: ReadonlyArray<{ value: RegionCode; label: string }> = [
  { value: 'europe', label: 'Europe' },
  { value: 'america', label: 'America' },
  { value: 'asia', label: 'Asia' },
];

const PRICE_REGION_FILTERS: ReadonlyArray<{ value: PriceRegion; label: string }> = [
  { value: 'live', label: 'Live' },
  { value: 'west', label: 'West' },
  { value: 'east', label: 'East' },
];

const SCHEME_FILTERS: ReadonlyArray<{ value: SchemeOption; label: string }> = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

const UPDATE_HISTORY: ReadonlyArray<{
  version: string;
  date: string;
  items: string[];
}> = [
  {
    version: '0.1.0',
    date: 'Phase 1',
    items: [
      'FastAPI backend + Expo mobile shell',
      'Forge, refining, calendar and sell workflows',
      'Frost & Arcane theme with dark/light mode',
    ],
  },
  {
    version: '0.1.0-refining',
    date: 'Current build',
    items: [
      'Refining material filters',
      'Focus / no-focus switch',
      'Best run estimates by material and tier',
    ],
  },
];

const COPY: Record<LanguageCode, {
  title: string;
  subtitle: string;
  localization: string;
  language: string;
  defaultServer: string;
  priceDataset: string;
  app: string;
  premium: string;
  premiumLifetime: string;
  premiumTrial: string;
  premiumExpired: string;
  premiumDaysLeft: (days: number) => string;
  premiumTrialLength: (days: number) => string;
  premiumStarted: string;
  premiumEnds: string;
  premiumProduct: string;
  premiumBuy: string;
  premiumBuying: string;
  premiumRestore: string;
  premiumRestoring: string;
  appearance: string;
  themeToggle: string;
  marketAlerts: string;
  diagnostics: string;
  about: string;
  version: string;
  build: string;
  updates: string;
}> = {
  cs: {
    title: 'Nastavení',
    subtitle: 'Předvolby aplikace, verze a historie změn.',
    localization: 'Lokalizace',
    language: 'Jazyk',
    defaultServer: 'Výchozí server',
    priceDataset: 'Cenová data',
    app: 'Aplikace',
    premium: 'Premium',
    premiumLifetime: 'Lifetime full verze aktivní',
    premiumTrial: 'Trial aktivní',
    premiumExpired: 'Trial skončil',
    premiumDaysLeft: (days) => `${days} ${days === 1 ? 'den' : days >= 2 && days <= 4 ? 'dny' : 'dní'} zbývá`,
    premiumTrialLength: (days) => `${days} dní zdarma`,
    premiumStarted: 'Začátek trialu',
    premiumEnds: 'Konec trialu',
    premiumProduct: 'Produkt',
    premiumBuy: 'Koupit lifetime',
    premiumBuying: 'Otevírám App Store...',
    premiumRestore: 'Obnovit nákup',
    premiumRestoring: 'Obnovuji...',
    appearance: 'Vzhled',
    themeToggle: 'Tmavý / světlý režim',
    marketAlerts: 'Market alerty',
    diagnostics: 'Anonymní diagnostika',
    about: 'Info',
    version: 'Verze',
    build: 'Build',
    updates: 'Aktualizace',
  },
  en: {
    title: 'Settings',
    subtitle: 'App preferences, version info and update history.',
    localization: 'Localization',
    language: 'Language',
    defaultServer: 'Default server',
    priceDataset: 'Price dataset',
    app: 'App',
    premium: 'Premium',
    premiumLifetime: 'Lifetime full access active',
    premiumTrial: 'Trial active',
    premiumExpired: 'Trial ended',
    premiumDaysLeft: (days) => `${days} ${days === 1 ? 'day' : 'days'} left`,
    premiumTrialLength: (days) => `${days} days free`,
    premiumStarted: 'Trial started',
    premiumEnds: 'Trial ends',
    premiumProduct: 'Product',
    premiumBuy: 'Buy lifetime',
    premiumBuying: 'Opening App Store...',
    premiumRestore: 'Restore purchase',
    premiumRestoring: 'Restoring...',
    appearance: 'Appearance',
    themeToggle: 'Top-right toggle',
    marketAlerts: 'Market alerts',
    diagnostics: 'Anonymous diagnostics',
    about: 'About',
    version: 'Version',
    build: 'Build',
    updates: 'Updates',
  },
};

export default function SettingsScreen() {
  const { colors: themeColors, scheme, setScheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const premium = usePremium();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const copy = COPY[language];

  const [region, setRegion] = useState<RegionCode>('europe');
  const [priceRegion, setPriceRegion] = useState<PriceRegion>('live');
  const [notifications, setNotifications] = useState<boolean>(false);
  const [analytics, setAnalytics] = useState<boolean>(false);

  const appVersion = Constants.expoConfig?.version ?? '0.1.0';
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode?.toString() ??
    'dev';
  const bundleId =
    Constants.expoConfig?.ios?.bundleIdentifier ??
    Constants.expoConfig?.android?.package ??
    'com.alex.albioncrafting';

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

        <SectionHeader title={copy.localization} />
        <GlowCard>
          <SettingBlock label={copy.language}>
            <FilterChips
              items={LANGUAGE_FILTERS}
              active={language}
              onChange={setLanguage}
              activeTone="arcane"
              scrollable={false}
            />
          </SettingBlock>

          <SettingBlock label={copy.defaultServer}>
            <FilterChips
              items={REGION_FILTERS}
              active={region}
              onChange={setRegion}
              activeTone="frost"
              scrollable={false}
            />
          </SettingBlock>

          <SettingBlock label={copy.priceDataset} last>
            <FilterChips
              items={PRICE_REGION_FILTERS}
              active={priceRegion}
              onChange={setPriceRegion}
              activeTone="rose"
              scrollable={false}
            />
          </SettingBlock>
        </GlowCard>

        <SectionHeader title={copy.premium} />
        <GlowCard padded={false}>
          <View style={[styles.row, styles.rowDivider]}>
            <View style={styles.rowIcon}>
              <Ionicons name="sparkles" size={16} color={themeColors.arcane} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>
                {premium.source === 'lifetime'
                  ? copy.premiumLifetime
                  : premium.source === 'trial'
                    ? copy.premiumTrial
                    : copy.premiumExpired}
              </Text>
              <Text style={styles.rowHint}>
                {premium.source === 'trial'
                  ? `${copy.premiumDaysLeft(premium.daysLeft)} · ${copy.premiumTrialLength(PREMIUM_TRIAL_DAYS)}`
                  : premium.lifetimePrice ?? premium.lifetimeProductId}
              </Text>
            </View>
          </View>
          <SettingsRow
            icon="calendar"
            title={copy.premiumStarted}
            value={formatPremiumDate(premium.trialStartedAt)}
          />
          <SettingsRow
            icon="timer"
            title={copy.premiumEnds}
            value={formatPremiumDate(premium.trialEndsAt)}
          />
          <SettingsRow
            icon="pricetag"
            title={copy.premiumProduct}
            value={premium.lifetimeProductId}
          />
          <View style={styles.premiumActions}>
            <Pressable
              onPress={premium.purchaseLifetimeAccess}
              disabled={premium.purchaseInProgress}
              style={({ pressed }) => [
                styles.premiumAction,
                styles.premiumActionPrimary,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="lock-open" size={16} color={themeColors.bgCanvas} />
              <Text style={styles.premiumActionPrimaryText}>
                {premium.purchaseInProgress
                  ? copy.premiumBuying
                  : `${copy.premiumBuy}${premium.lifetimePrice ? ` · ${premium.lifetimePrice}` : ''}`}
              </Text>
            </Pressable>
            <Pressable
              onPress={premium.restorePurchases}
              disabled={premium.restoreInProgress}
              style={({ pressed }) => [styles.premiumAction, pressed && styles.pressed]}
            >
              <Ionicons name="refresh" size={16} color={themeColors.frost} />
              <Text style={styles.premiumActionText}>
                {premium.restoreInProgress ? copy.premiumRestoring : copy.premiumRestore}
              </Text>
            </Pressable>
            {premium.error ? <Text style={styles.premiumError}>{premium.error}</Text> : null}
          </View>
        </GlowCard>

        <SectionHeader title={copy.app} />
        <GlowCard padded={false}>
          <View style={[styles.row, styles.rowDivider]}>
            <View style={styles.rowIcon}>
              <Ionicons name="moon" size={16} color={themeColors.arcane} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{copy.appearance}</Text>
              <Text style={styles.rowHint}>{copy.themeToggle}</Text>
              <View style={styles.schemeChips}>
                <FilterChips
                  items={SCHEME_FILTERS}
                  active={scheme}
                  onChange={setScheme}
                  activeTone="frost"
                  scrollable={false}
                />
              </View>
            </View>
          </View>
          <SettingsSwitchRow
            icon="notifications"
            title={copy.marketAlerts}
            enabled={notifications}
            onPress={() => setNotifications((value) => !value)}
          />
          <SettingsSwitchRow
            icon="analytics"
            title={copy.diagnostics}
            enabled={analytics}
            onPress={() => setAnalytics((value) => !value)}
            last
          />
        </GlowCard>

        <SectionHeader title={copy.about} />
        <GlowCard padded={false}>
          <SettingsRow icon="phone-portrait" title={copy.version} value={appVersion} />
          <SettingsRow icon="cube" title={copy.build} value={buildNumber} />
          <SettingsRow icon="finger-print" title="Bundle ID" value={bundleId} />
          <SettingsRow icon="server" title="API" value={API_BASE_URL} last />
        </GlowCard>

        <View style={styles.badgeRow}>
          <StatBadge label={`Language: ${language.toUpperCase()}`} tone="arcane" />
          <StatBadge label={`Server: ${region}`} tone="frost" />
          <StatBadge label={`Prices: ${priceRegion}`} tone="rose" />
        </View>

        <SectionHeader title={copy.updates} subtitle="Changelog" />
        <View style={styles.timeline}>
          {UPDATE_HISTORY.map((entry, idx) => (
            <UpdateCard
              key={entry.version}
              entry={entry}
              isLast={idx === UPDATE_HISTORY.length - 1}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatPremiumDate(date: Date | null): string {
  if (!date) return '-';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function SettingBlock({
  label,
  children,
  last = false,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  return (
    <View style={[styles.settingBlock, !last && styles.settingDivider]}>
      <Text style={styles.settingLabel}>{label}</Text>
      {children}
    </View>
  );
}

function SettingsRow({
  icon,
  title,
  value,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  last?: boolean;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={16} color={themeColors.arcane} />
      </View>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SettingsSwitchRow({
  icon,
  title,
  enabled,
  onPress,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  enabled: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.pressed]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={16} color={themeColors.arcane} />
      </View>
      <Text style={styles.rowTitle}>{title}</Text>
      <View style={[styles.switchTrack, enabled && styles.switchTrackOn]}>
        <View style={[styles.switchThumb, enabled && styles.switchThumbOn]} />
      </View>
    </Pressable>
  );
}

function UpdateCard({
  entry,
  isLast,
}: {
  entry: (typeof UPDATE_HISTORY)[number];
  isLast: boolean;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  return (
    <View style={styles.updateRow}>
      <View style={styles.timelineRail}>
        <View style={styles.timelineDot} />
        {!isLast ? <View style={styles.timelineLine} /> : null}
      </View>
      <GlowCard style={styles.updateCard}>
        <View style={styles.updateHeader}>
          <Text style={styles.updateVersion}>{entry.version}</Text>
          <Text style={styles.updateDate}>{entry.date}</Text>
        </View>
        {entry.items.map((item) => (
          <View key={item} style={styles.updateItem}>
            <Ionicons name="checkmark-circle" size={14} color={themeColors.frost} />
            <Text style={styles.updateText}>{item}</Text>
          </View>
        ))}
      </GlowCard>
    </View>
  );
}

function createStyles(colors: AppColors) {
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
    settingBlock: { gap: spacing.sm, paddingVertical: spacing.sm },
    settingDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
      paddingBottom: spacing.md,
      marginBottom: spacing.xs,
    },
    settingLabel: {
      ...typography.captionStrong,
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
    },
    row: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.sm,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    pressed: { backgroundColor: colors.tagBg },
    rowIcon: {
      width: 30,
      height: 30,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.arcaneSoft,
      borderWidth: 1,
      borderColor: colors.arcaneGlow,
    },
    rowTitle: { ...typography.bodyStrong, color: colors.textPrimary, flex: 1 },
    rowBody: { flex: 1, minWidth: 0 },
    rowHint: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: 2,
    },
    schemeChips: {
      marginTop: spacing.sm,
    },
    rowValue: {
      ...typography.captionStrong,
      color: colors.textSecondary,
      maxWidth: '56%',
      textAlign: 'right',
    },
    switchTrack: {
      width: 46,
      height: 28,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface2,
      padding: 3,
      justifyContent: 'center',
    },
    switchTrackOn: {
      borderColor: colors.frostGlow,
      backgroundColor: colors.frostSoft,
    },
    switchThumb: {
      width: 20,
      height: 20,
      borderRadius: radius.pill,
      backgroundColor: colors.textMuted,
    },
    switchThumbOn: {
      alignSelf: 'flex-end',
      backgroundColor: colors.frost,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.base,
      paddingHorizontal: spacing.xs,
    },
    premiumActions: {
      gap: spacing.sm,
      padding: spacing.base,
    },
    premiumAction: {
      minHeight: 44,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.frostGlow,
      backgroundColor: colors.frostSoft,
      paddingHorizontal: spacing.base,
    },
    premiumActionPrimary: {
      borderColor: colors.arcaneGlow,
      backgroundColor: colors.arcane,
    },
    premiumActionText: {
      ...typography.bodyStrong,
      color: colors.frost,
      textAlign: 'center',
    },
    premiumActionPrimaryText: {
      ...typography.bodyStrong,
      color: colors.bgCanvas,
      textAlign: 'center',
    },
    premiumError: {
      ...typography.caption,
      color: colors.crimson,
      textAlign: 'center',
    },
    timeline: { gap: spacing.sm },
    updateRow: { flexDirection: 'row', gap: spacing.sm },
    timelineRail: { width: 18, alignItems: 'center' },
    timelineDot: {
      width: 10,
      height: 10,
      borderRadius: radius.pill,
      backgroundColor: colors.arcane,
      marginTop: spacing.lg,
    },
    timelineLine: {
      flex: 1,
      width: StyleSheet.hairlineWidth,
      backgroundColor: colors.lineStrong,
      marginTop: spacing.xs,
    },
    updateCard: { flex: 1, marginBottom: spacing.sm },
    updateHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.base,
      marginBottom: spacing.sm,
    },
    updateVersion: { ...typography.heroTitle, color: colors.textPrimary },
    updateDate: { ...typography.captionStrong, color: colors.textMuted },
    updateItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    updateText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  });
}
