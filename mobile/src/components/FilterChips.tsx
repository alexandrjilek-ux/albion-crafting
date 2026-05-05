// Horizontal scrollable chip row — používá se na Top items pro výběr města
// (Caerleon / Bridgewatch / Fort Sterling / Lymhurst / Martlock / Thetford)
// a módu (equipment / food).

import { ScrollView, StyleSheet, View } from 'react-native';

import { StatBadge } from './StatBadge';
import { spacing } from '@theme/spacing';

export interface FilterChip<T extends string> {
  value: T;
  label: string;
}

export interface FilterChipsProps<T extends string> {
  items: ReadonlyArray<FilterChip<T>>;
  active: T;
  onChange: (value: T) => void;
  // Tone aktivního chipu — default "arcane".
  activeTone?: 'arcane' | 'frost' | 'rose';
  // Pokud chceš inline (bez scrollu) — ignored, použij ScrollView default.
  scrollable?: boolean;
}

export function FilterChips<T extends string>({
  items,
  active,
  onChange,
  activeTone = 'arcane',
  scrollable = true,
}: FilterChipsProps<T>) {
  const Body = scrollable ? ScrollView : View;
  const bodyProps = scrollable
    ? {
        horizontal: true,
        showsHorizontalScrollIndicator: false,
        contentContainerStyle: styles.contentScroll,
      }
    : { style: styles.row };

  return (
    <Body {...(bodyProps as object)}>
      {items.map((it) => (
        <View key={it.value} style={styles.chipWrap}>
          <StatBadge
            label={it.label}
            tone={it.value === active ? activeTone : 'default'}
            onPress={() => onChange(it.value)}
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
