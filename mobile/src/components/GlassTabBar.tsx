// Custom tab bar pro expo-router (Tabs.tabBar prop). Vrací plovoucí
// "glass" pill s blur overlayem — odpovídá `.tabbar` z mockupu (bottom: 16,
// left/right: 16, height: 64, rgba(17,21,28,.85) + 24px backdrop blur).

import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, tabBarBg, type AppColors } from '@theme/colors';
import { useLanguage } from '../i18n/LanguageProvider';
import { useTheme } from '@theme/ThemeProvider';
import { glow, radius, spacing } from '@theme/spacing';
import { typography } from '@theme/typography';

// Mapping route name → ikona + label (cs).
//
// Drž pole `tabbar.tab.icon` jako Ionicons name; pokud user chce vyměnit
// ikon set, jeden swap tady.
const TAB_META: Record<string, {
  icon: keyof typeof Ionicons.glyphMap;
  labels: { cs: string; en: string };
}> = {
  index: { icon: 'star', labels: { cs: 'Forge', en: 'Forge' } },
  refining: { icon: 'flame', labels: { cs: 'Refining', en: 'Refining' } },
  leveling: { icon: 'calendar-clear', labels: { cs: 'Calendar', en: 'Calendar' } },
  sell: { icon: 'pricetag', labels: { cs: 'Sell', en: 'Sell' } },
  settings: { icon: 'settings', labels: { cs: 'Nastavení', en: 'Settings' } },
};

export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors: themeColors } = useTheme();
  const { language } = useLanguage();
  styles = createStyles(themeColors);

  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, spacing.base);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <BlurView intensity={30} tint="dark" style={styles.blur}>
        <View style={styles.bar}>
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const meta = TAB_META[route.name] ?? {
              icon: 'ellipse',
              labels: { cs: route.name, en: route.name },
            };
            const label = meta.labels[language];
            const options = descriptors[route.key]?.options;
            const accessibilityLabel = options?.tabBarAccessibilityLabel ?? label;

            const onPress = () => {
              if (Platform.OS === 'ios') {
                void Haptics.selectionAsync();
              }
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                accessibilityState={focused ? { selected: true } : {}}
                onPress={onPress}
                style={({ pressed }) => [
                  styles.tab,
                  focused && styles.tabActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons
                  name={meta.icon}
                  size={20}
                  color={focused ? themeColors.arcane : themeColors.textMuted}
                />
                <Text
                  style={[
                    styles.label,
                    { color: focused ? themeColors.arcane : themeColors.textMuted },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

let styles = createStyles(colors);

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    height: 64,
    borderRadius: radius['3xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    ...glow.card,
  },
  blur: {
    flex: 1,
  },
  bar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    backgroundColor: tabBarBg,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  tabActive: {
    backgroundColor: 'rgba(167,139,250,0.10)',
  },
  label: {
    ...typography.tab,
  },
  });
}
