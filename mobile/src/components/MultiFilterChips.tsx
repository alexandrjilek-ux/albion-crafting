// Multi-select variant of FilterChips. Active state is a Set; tap toggles
// membership. Použití: enchants ({0,1,2,3}), tiers ({4,5,6}).
//
// Záměrně ne přepoužívám FilterChips a neudělal jsem mu boolean prop —
// API by se zkomplikovalo (active jako T | T[]) a původní 1:1 mapping na
// "city / mode" by zmizel.

import { ScrollView, StyleSheet, View } from 'react-native';

import { StatBadge } from './StatBadge';
import { spacing } from '@theme/spacing';
import type { BadgeTone } from './StatBadge';

export interface MultiFilterChip<T extends string | number> {
  value: T;
  label: string;
}

export interface MultiFilterChipsProps<T extends string | number> {
  items: ReadonlyArray<MultiFilterChip<T>>;
  active: ReadonlyArray<T>;
  onToggle: (value: T) => void;
  activeTone?: BadgeTone;
  scrollable?: boolean;
  // Disable enables only-1-allowed-active fallback: pokud uživatel odznačí
  // poslední aktivní chip, zachovat ho. Bez tohohle by se prázdná set
  // poslala backendu, který pak vrátí "no results".
  minSelected?: number;
}

export function MultiFilterChips<T extends string | number>({
  items,
  active,
  onToggle,
  activeTone = 'arcane',
  scrollable = true,
  minSelected = 1,
}: MultiFilterChipsProps<T>) {
  const Body = scrollable ? ScrollView : View;
  const bodyProps = scrollable
    ? {
        horizontal: true,
        showsHorizontalScrollIndicator: false,
        contentContainerStyle: styles.contentScroll,
      }
    : { style: styles.row };

  const activeSet = new Set(active);

  const handle = (value: T) => {
    const isActive = activeSet.has(value);
    if (isActive && active.length <= minSelected) {
      // Nepovolíme prázdnou selekci — UX guardrail.
      return;
    }
    onToggle(value);
  };

  return (
    <Body {...(bodyProps as object)}>
      {items.map((it) => (
        <View key={String(it.value)} style={styles.chipWrap}>
          <StatBadge
            label={it.label}
            tone={activeSet.has(it.value) ? activeTone : 'default'}
            onPress={() => handle(it.value)}
          />
        </View>
      ))}
    </Body>
  );
}

const styles = StyleSheet.create({
  contentScroll: {
    paddingHorizontal: spacing.xs,
    gap: spacing.xs + 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  chipWrap: {
    marginRight: spacing.xs + 2,
  },
});
