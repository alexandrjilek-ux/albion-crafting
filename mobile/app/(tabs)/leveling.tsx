import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchBonusCalendar } from '../../src/api/bonusCalendar';
import type { BonusCalendarResponse, BonusEntry } from '../../src/api/types';
import {
  type SelectedActivityBonus,
  useActivitiesBonuses,
} from '../../src/activities/ActivitiesBonusProvider';
import { GlowCard, ThemeToggle } from '../../src/components';
import { useLanguage, type LanguageCode } from '../../src/i18n/LanguageProvider';
import { type AppColors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius, spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

const COPY: Record<LanguageCode, {
  title: string;
  subtitle: string;
  dailyTitle: string;
  bonusTileMeta: string;
  appliedMeta: string;
  compactBonusLabel: string;
  possibleDailyTitle: string;
  dailySubtitle: (count: number) => string;
  manualHint: string;
  selectedTitle: string;
  selectedEmpty: string;
  clear: string;
  empty: string;
  backendUnavailable: string;
}> = {
  cs: {
    title: 'Calendar',
    subtitle: 'Ručně zadej bonusy z herního Activities tabu.',
    dailyTitle: 'Dnešní crafting bonusy',
    bonusTileMeta: '+10% vrácení surovin',
    appliedMeta: 'Započítáno ve Forge i Refining',
    compactBonusLabel: 'bonus',
    possibleDailyTitle: 'Crafting bonusy',
    dailySubtitle: (count) => `${count} kategorií. Vybrat můžeš 2 aktuální bonusy.`,
    manualHint: 'Forge a Refining je automaticky započítají do ceny surovin.',
    selectedTitle: 'Aktivní výběr',
    selectedEmpty: 'Vyber bonusy níže podle toho, co právě vidíš ve hře.',
    clear: 'Vymazat',
    empty: 'Bonusy se nepodařilo načíst.',
    backendUnavailable: 'Backend nedostupný',
  },
  en: {
    title: 'Calendar',
    subtitle: 'Enter bonuses manually from the in-game Activities tab.',
    dailyTitle: 'Today crafting bonuses',
    bonusTileMeta: '+10% return rate',
    appliedMeta: 'Applied in Forge & Refining',
    compactBonusLabel: 'bonus',
    possibleDailyTitle: 'Crafting bonuses',
    dailySubtitle: (count) => `${count} categories. Pick the 2 active bonuses.`,
    manualHint: 'Forge and Refining automatically include them in material costs.',
    selectedTitle: 'Active selection',
    selectedEmpty: 'Pick bonuses below based on what you currently see in game.',
    clear: 'Clear',
    empty: 'Could not load bonuses.',
    backendUnavailable: 'Backend unavailable',
  },
};

export default function BonusCalendarScreen() {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const copy = COPY[language];
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const {
    selectedBonuses,
    isSelected,
    toggleBonus,
    clearBonuses,
  } = useActivitiesBonuses();

  const [data, setData] = useState<BonusCalendarResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchBonusCalendar()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Network error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

        {error ? (
          <ErrorBlock error={error} copy={copy} styles={styles} />
        ) : loading && !data ? (
          <View style={styles.loading}>
            <ActivityIndicator color={themeColors.arcane} />
          </View>
        ) : data ? (
          <>
            <GlowCard variant="frost" style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View style={styles.heroIconWrap}>
                  <Text style={styles.heroEmoji}>✨</Text>
                </View>
                <View style={styles.heroBody}>
                  <Text style={styles.heroTitle}>{copy.dailyTitle}</Text>
                  <Text style={styles.heroMeta}>{copy.manualHint}</Text>
                </View>
              </View>
              <SelectedBonusWindow
                bonuses={selectedBonuses}
                copy={copy}
                onClear={clearBonuses}
                styles={styles}
              />
            </GlowCard>

            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>{copy.possibleDailyTitle}</Text>
              <Text style={styles.panelSubtitle}>{copy.dailySubtitle(data.daily_crafting.length)}</Text>
            </View>

            <BonusGrid
              entries={data.daily_crafting}
              copy={copy}
              isSelected={isSelected}
              onToggle={toggleBonus}
              styles={styles}
            />
          </>
        ) : (
          <Text style={styles.empty}>{copy.empty}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BonusGrid({
  entries,
  copy,
  isSelected,
  onToggle,
  styles,
}: {
  entries: BonusEntry[];
  copy: (typeof COPY)[LanguageCode];
  isSelected: (code: string) => boolean;
  onToggle: (entry: BonusEntry) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.grid}>
      {entries.map((entry) => {
        const selected = isSelected(entry.code);
        return (
        <Pressable
          key={entry.code}
          onPress={() => onToggle(entry)}
          style={({ pressed }) => [
            styles.bonusTile,
            selected && styles.bonusTileSelected,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.bonusTileEmoji}>
            <Text style={styles.bonusEmoji}>{bonusEmoji(entry.code)}</Text>
          </View>
          <View style={styles.bonusTileBody}>
            <Text style={[styles.bonusTileTitle, selected && styles.bonusTileTitleSelected]}>{entry.label}</Text>
            <Text style={styles.bonusTileMeta}>{copy.bonusTileMeta}</Text>
          </View>
          {selected ? (
            <Ionicons name="checkmark-circle" size={18} color={styles.activeIconColor.color} />
          ) : null}
        </Pressable>
        );
      })}
    </View>
  );
}

function SelectedBonusWindow({
  bonuses,
  copy,
  onClear,
  styles,
}: {
  bonuses: SelectedActivityBonus[];
  copy: (typeof COPY)[LanguageCode];
  onClear: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.selectedWindow}>
      <View style={styles.selectedHeader}>
        <View>
          <Text style={styles.selectedEyebrow}>{copy.selectedTitle}</Text>
          <Text style={styles.selectedCount}>{bonuses.length}/2</Text>
        </View>
        {bonuses.length > 0 ? (
          <Pressable
            onPress={onClear}
            style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
          >
            <Text style={styles.clearText}>{copy.clear}</Text>
          </Pressable>
        ) : null}
      </View>

      {bonuses.length === 0 ? (
        <View style={styles.emptySelection}>
          <Text style={styles.emptySelectionEmoji}>🧭</Text>
          <Text style={styles.emptySelectionText}>{copy.selectedEmpty}</Text>
        </View>
      ) : (
        <View style={styles.selectedList}>
          {bonuses.map((bonus) => (
            <View key={bonus.code} style={styles.selectedBonus}>
              <View style={styles.selectedEmojiWrap}>
                <Text style={styles.selectedEmoji}>{bonusEmoji(bonus.code)}</Text>
              </View>
              <View style={styles.selectedBonusBody}>
                <Text style={styles.selectedBonusTitle}>{bonus.label}</Text>
                <Text style={styles.selectedBonusMeta}>{copy.appliedMeta}</Text>
              </View>
              <View style={styles.selectedBonusValue}>
                <Text style={styles.selectedBonusPercent}>+10%</Text>
                <Text style={styles.selectedBonusLabel}>{copy.compactBonusLabel}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ErrorBlock({
  error,
  copy,
  styles,
}: {
  error: string;
  copy: (typeof COPY)[LanguageCode];
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <GlowCard variant="rose" style={styles.errorCard}>
      <Text style={styles.errorTitle}>{copy.backendUnavailable}</Text>
      <Text style={styles.errorBody}>{error}</Text>
    </GlowCard>
  );
}

function bonusEmoji(code: string): string {
  if (code.includes('SWORD') || code.includes('DAGGER') || code.includes('AXE')) return '⚔️';
  if (code.includes('BOW') || code.includes('CROSSBOW')) return '🏹';
  if (code.includes('STAFF') || code.includes('ORB') || code.includes('BOOK')) return '🔮';
  if (code.includes('PLATE')) return '🛡️';
  if (code.includes('LEATHER')) return '🥾';
  if (code.includes('CLOTH')) return '🧵';
  if (code.includes('OFFHAND') || code.includes('SHIELD') || code.includes('TORCH') || code.includes('HORN')) return '🛡️';
  if (code.includes('FOOD') || code.includes('MEAL')) return '🍲';
  if (code.includes('POTION')) return '🧪';
  if (code.includes('BAG')) return '🎒';
  if (code.includes('CAPE')) return '🧥';
  if (code.includes('ORE')) return '⛏️';
  if (code.includes('WOOD')) return '🪵';
  if (code.includes('HIDE')) return '🟤';
  if (code.includes('FIBER')) return '🌿';
  if (code.includes('ROCK')) return '🪨';
  return '✨';
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
    heroCard: { marginTop: spacing.lg },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingBottom: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    heroIconWrap: {
      width: 48,
      height: 48,
      borderRadius: radius.base,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.arcaneSoft,
      borderWidth: 1,
      borderColor: colors.arcaneGlow,
    },
    heroEmoji: { fontSize: 25 },
    heroBody: { flex: 1, minWidth: 0 },
    heroTitle: { ...typography.heroTitle, color: colors.textPrimary },
    heroMeta: { ...typography.captionStrong, color: colors.textSecondary, marginTop: spacing.xs },
    selectedWindow: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.frostGlow,
      backgroundColor: colors.frostSoft,
      gap: spacing.md,
    },
    selectedHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    selectedEyebrow: { ...typography.eyebrow, color: colors.textMuted },
    selectedCount: { ...typography.captionStrong, color: colors.textSecondary, marginTop: 2 },
    clearButton: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.base,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface2,
    },
    clearText: { ...typography.captionStrong, color: colors.textSecondary },
    emptySelection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
    },
    emptySelectionEmoji: { fontSize: 26 },
    emptySelectionText: { ...typography.body, color: colors.textSecondary, flex: 1 },
    selectedList: { gap: spacing.sm },
    selectedBonus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.sm,
      borderRadius: radius.base,
      backgroundColor: colors.surface1,
      borderWidth: 1,
      borderColor: colors.lineStrong,
    },
    selectedEmojiWrap: {
      width: 40,
      height: 40,
      borderRadius: radius.base,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface2,
    },
    selectedEmoji: { fontSize: 22 },
    selectedBonusBody: { flex: 1, minWidth: 0 },
    selectedBonusTitle: { ...typography.bodyStrong, color: colors.textPrimary },
    selectedBonusMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    selectedBonusValue: {
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 54,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs,
      borderRadius: radius.base,
      backgroundColor: colors.arcaneSoft,
    },
    selectedBonusPercent: { ...typography.captionStrong, color: colors.arcane },
    selectedBonusLabel: { ...typography.caption, color: colors.textMuted, marginTop: -2 },
    panelHeader: { marginTop: spacing.lg, marginBottom: spacing.sm },
    panelTitle: { ...typography.heroTitle, color: colors.textPrimary },
    panelSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    grid: {
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    bonusTile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.base,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface1,
    },
    bonusTileSelected: {
      borderColor: colors.arcaneGlow,
      backgroundColor: colors.arcaneSoft,
    },
    bonusTileEmoji: {
      width: 34,
      height: 34,
      borderRadius: radius.base,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface2,
    },
    bonusEmoji: { fontSize: 18 },
    bonusTileBody: { flex: 1, minWidth: 0 },
    bonusTileTitle: { ...typography.bodyStrong, color: colors.textPrimary },
    bonusTileTitleSelected: { color: colors.arcane },
    bonusTileMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    activeIconColor: { color: colors.arcane },
    pressed: { opacity: 0.72 },
    empty: { color: colors.textMuted, textAlign: 'center', padding: spacing.lg },
    loading: { padding: spacing.xl, alignItems: 'center' },
    errorCard: { marginTop: spacing.lg },
    errorTitle: { ...typography.heroTitle, color: colors.rose, marginBottom: spacing.xs },
    errorBody: { ...typography.body, color: colors.textPrimary },
  });
}
