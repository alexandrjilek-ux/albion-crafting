import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import {
  applyColorScheme,
  colors,
  type AppColors,
  type ThemeScheme,
} from './colors';

interface ThemeContextValue {
  colors: AppColors;
  scheme: ThemeScheme;
  isDark: boolean;
  toggleScheme: () => void;
  setScheme: (scheme: ThemeScheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [scheme, setSchemeState] = useState<ThemeScheme>('dark');

  const setScheme = (next: ThemeScheme) => {
    applyColorScheme(next);
    setSchemeState(next);
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors,
      scheme,
      isDark: scheme === 'dark',
      toggleScheme: () => setScheme(scheme === 'dark' ? 'light' : 'dark'),
      setScheme,
    }),
    [scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return value;
}
