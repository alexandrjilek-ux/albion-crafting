// Frost & Arcane palette — odpovídá mockups/variant2_color_frost_arcane.html.
// Žádné hex literály jinde než tady. Používej `colors.x` všude.
//
// Mapping mockup CSS var → tady:
//   --canvas       → bgCanvas
//   --surface-1    → surface1
//   --surface-2    → surface2
//   --surface-3    → surface3
//   --line         → line
//   --text         → textPrimary
//   --text-2       → textSecondary
//   --text-3       → textMuted
//   --gold         → arcane          (brand violet — "Arcane Violet")
//   --gold-deep    → arcaneDeep      ("Deep Mage")
//   --emerald      → frost           (profit cyan — "Frost Cyan")
//   --violet       → rose            ("Sorcery Rose")
//   --bronze       → bronze
//   --silver       → silver
//   --crimson      → crimson
//   --amber        → amber

export type ThemeScheme = 'dark' | 'light';

export type AppColors = {
  bgCanvas: string;
  surface1: string;
  surface2: string;
  surface3: string;
  line: string;
  lineStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  arcane: string;
  arcaneSoft: string;
  arcaneGlow: string;
  arcaneDeep: string;
  frost: string;
  frostGlow: string;
  frostSoft: string;
  rose: string;
  roseSoft: string;
  silver: string;
  bronze: string;
  crimson: string;
  amber: string;
  cyan: string;
  freshHot: string;
  freshStale: string;
  freshCold: string;
  tagBg: string;
  tagBorder: string;
};

export const darkColors: AppColors = {
  // Canvas / background
  bgCanvas: '#0A0820',
  surface1: '#13102A',
  surface2: '#1A1638',
  surface3: '#231E4A',

  // Borders / dividers
  line: 'rgba(255,255,255,0.06)',
  lineStrong: 'rgba(255,255,255,0.12)',

  // Text
  textPrimary: '#E8EDF5',
  textSecondary: '#98A2B8',
  textMuted: '#5B6374',

  // Brand — Arcane Violet
  arcane: '#A78BFA',
  arcaneSoft: 'rgba(167,139,250,0.18)',
  arcaneGlow: 'rgba(167,139,250,0.35)',
  arcaneDeep: '#5B21B6',

  // Profit / positive — Frost Cyan
  frost: '#67E8F9',
  frostGlow: 'rgba(103,232,249,0.40)',
  frostSoft: 'rgba(103,232,249,0.10)',

  // Accent — Sorcery Rose
  rose: '#F472B6',
  roseSoft: 'rgba(244,114,182,0.14)',

  // Tier / podium accents
  silver: '#D8DDE2',
  bronze: '#D2884F',

  // Status / alerts
  crimson: '#EF4444',
  amber: '#F59E0B',
  cyan: '#38BDF8',

  // Freshness dots
  freshHot: '#67E8F9',
  freshStale: '#FACC15',
  freshCold: '#F97316',

  // Misc tag chips
  tagBg: 'rgba(255,255,255,0.04)',
  tagBorder: 'rgba(255,255,255,0.06)',
};

export const lightColors: AppColors = {
  bgCanvas: '#F4F7FB',
  surface1: '#FFFFFF',
  surface2: '#EAF0F8',
  surface3: '#DDE7F2',

  line: 'rgba(15,23,42,0.08)',
  lineStrong: 'rgba(15,23,42,0.16)',

  textPrimary: '#111827',
  textSecondary: '#526179',
  textMuted: '#8490A3',

  arcane: '#6D5BD0',
  arcaneSoft: 'rgba(109,91,208,0.14)',
  arcaneGlow: 'rgba(109,91,208,0.22)',
  arcaneDeep: '#4C1D95',

  frost: '#0891B2',
  frostGlow: 'rgba(8,145,178,0.28)',
  frostSoft: 'rgba(8,145,178,0.10)',

  rose: '#DB2777',
  roseSoft: 'rgba(219,39,119,0.12)',

  silver: '#64748B',
  bronze: '#B96F32',

  crimson: '#DC2626',
  amber: '#D97706',
  cyan: '#0284C7',

  freshHot: '#0891B2',
  freshStale: '#CA8A04',
  freshCold: '#EA580C',

  tagBg: 'rgba(15,23,42,0.04)',
  tagBorder: 'rgba(15,23,42,0.08)',
};

export const colors: AppColors = { ...darkColors };

export function applyColorScheme(scheme: ThemeScheme): void {
  Object.assign(colors, scheme === 'light' ? lightColors : darkColors);
  tabBarBg = scheme === 'light' ? 'rgba(255,255,255,0.88)' : 'rgba(17,21,28,0.85)';
  heroCardGradient = [
    scheme === 'light' ? 'rgba(109,91,208,0.12)' : 'rgba(167,139,250,0.12)',
    scheme === 'light' ? 'rgba(109,91,208,0.0)' : 'rgba(167,139,250,0.0)',
  ];
  championGradient = [
    scheme === 'light' ? 'rgba(109,91,208,0.16)' : 'rgba(167,139,250,0.18)',
    colors.surface2,
  ];
  silverGradient = [
    scheme === 'light' ? 'rgba(100,116,139,0.14)' : 'rgba(216,221,226,0.14)',
    colors.surface2,
  ];
  bronzeGradient = ['rgba(210,136,79,0.16)', colors.surface2];
  ctaPrimaryGradient = [colors.arcane, '#8B5CF6'];
}

// Pre-baked tab bar background (used with expo-blur overlay).
// Matches `.tabbar` from mockup: rgba(17,21,28,.85) + 24px blur.
export let tabBarBg = 'rgba(17,21,28,0.85)';

// Hero card gradient stops — pass to expo-linear-gradient.
export let heroCardGradient = ['rgba(167,139,250,0.12)', 'rgba(167,139,250,0.0)'];

// Champion (gold/#1) podium step gradient stops.
export let championGradient = ['rgba(167,139,250,0.18)', colors.surface2];

// Silver (#2) podium step gradient stops.
export let silverGradient = ['rgba(216,221,226,0.14)', colors.surface2];

// Bronze (#3) podium step gradient stops.
export let bronzeGradient = ['rgba(210,136,79,0.16)', colors.surface2];

// CTA "primary" button — Arcane → Deep Mage.
export let ctaPrimaryGradient = [colors.arcane, '#8B5CF6'];

export type ColorToken = keyof typeof colors;
