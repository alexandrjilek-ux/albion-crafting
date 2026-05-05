import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { colors, type AppColors } from '@theme/colors';
import { useLanguage } from '../i18n/LanguageProvider';
import { radius } from '@theme/spacing';
import { useTheme } from '@theme/ThemeProvider';

export function ThemeToggle() {
  const { isDark, toggleScheme, colors: themeColors } = useTheme();
  const { language } = useLanguage();
  const label = language === 'en'
    ? isDark ? 'Switch to light mode' : 'Switch to dark mode'
    : isDark ? 'Prepnout na svetly rezim' : 'Prepnout na tmavy rezim';
  styles = createStyles(themeColors);

  return (
    <Pressable
      onPress={toggleScheme}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
    >
      <Ionicons
        name={isDark ? 'sunny' : 'moon'}
        size={18}
        color={isDark ? themeColors.frost : themeColors.arcane}
      />
    </Pressable>
  );
}

let styles = createStyles(colors);

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    button: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.lineStrong,
      backgroundColor: colors.surface1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
