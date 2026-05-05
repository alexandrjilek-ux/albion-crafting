// 4-px base scale. Inline magic numbers in StyleSheet are a smell —
// pick from `spacing` / `radius` first, only inline if there's a real reason.
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  '3xl': 40,
  '4xl': 56,
} as const;

export const radius = {
  xs: 6,
  sm: 8,
  md: 10,
  base: 12,
  lg: 14,
  xl: 16,
  '2xl': 20,
  '3xl': 22,
  pill: 999,
} as const;

// shadow / glow presets — RN shadow* props on iOS, elevation on Android.
// Android elevation is approximate; designs are iOS-first.
export const glow = {
  // Used on hero card, champion podium, primary CTA.
  arcane: {
    shadowColor: '#A78BFA',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  // Used on profit numbers, frost-tinted CTAs.
  frost: {
    shadowColor: '#67E8F9',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  // Subtle elevation for cards, tabbar.
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
} as const;

// iPad breakpoint — `useWindowDimensions().width >= breakpoints.tablet` toggles
// the three-pane layout in (tabs)/index.tsx.
export const breakpoints = {
  tablet: 768,
  desktop: 1180,
} as const;
