import { Platform, TextStyle } from 'react-native';

// SF Pro on iOS, system fallback on Android. Mockup uses heavy weights for
// numbers (tabular nums + 800) and 600/700 for headings.
const fontFamily = Platform.select({
  ios: undefined, // System San Francisco
  android: 'sans-serif',
  default: undefined,
}) as string | undefined;

// `tabular-nums` doesn't exist as a single RN style, but
// `fontVariant: ['tabular-nums']` works on iOS 14+ / Android with system fonts.
export const tabularNums: TextStyle = {
  fontVariant: ['tabular-nums'],
};

export const typography = {
  // Page-level large titles
  heroNumber: {
    fontFamily,
    fontSize: 38,
    fontWeight: '800' as const,
    letterSpacing: -0.7,
    ...tabularNums,
  },
  ipadH1: {
    fontFamily,
    fontSize: 32,
    fontWeight: '800' as const,
    letterSpacing: -0.6,
  },

  // Card / section headings
  heroTitle: {
    fontFamily,
    fontSize: 18,
    fontWeight: '600' as const,
  },
  detailH2: {
    fontFamily,
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },

  // Section eyebrows ("DAILY BEST", "PODIUM")
  eyebrow: {
    fontFamily,
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.8,
    textTransform: 'uppercase' as const,
  },
  sectionLabel: {
    fontFamily,
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: 2.2,
    textTransform: 'uppercase' as const,
  },

  // Body / list rows
  bodyStrong: {
    fontFamily,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  body: {
    fontFamily,
    fontSize: 14,
    fontWeight: '500' as const,
  },
  caption: {
    fontFamily,
    fontSize: 11,
    fontWeight: '500' as const,
  },
  captionStrong: {
    fontFamily,
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.6,
  },

  // Numbers in lists / KPIs
  profit: {
    fontFamily,
    fontSize: 14,
    fontWeight: '700' as const,
    ...tabularNums,
  },
  kpiValue: {
    fontFamily,
    fontSize: 18,
    fontWeight: '700' as const,
    ...tabularNums,
  },

  // Tab bar
  tab: {
    fontFamily,
    fontSize: 10,
    fontWeight: '600' as const,
  },
} as const;

export type TypographyKey = keyof typeof typography;
