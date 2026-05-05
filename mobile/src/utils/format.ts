// Formátování: silver / %, kompaktní dvoupísmenné kódy měst, freshness dot
// barvy. Engine vrací floats — všechno tady ber jako idempotentní.

import { colors } from '@theme/colors';

// Albion silver má rozsahy 1k–10M+. Použijeme `cs-CZ` mezery jako
// thousand-separator (matchne mockup "142 380"). I anglická verze tomu
// rozumí na první pohled.
const silverFormatter = new Intl.NumberFormat('cs-CZ', {
  maximumFractionDigits: 0,
});

export function formatSilver(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return silverFormatter.format(Math.round(value));
}

// Pro compact display (T6 Master's Plate "+118.9k").
export function formatSilverCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return formatSilver(value);
}

export function formatProfit(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const formatted = formatSilver(Math.abs(value));
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatted}`;
}

export function formatPercent(
  value: number | null | undefined,
  fractionDigits = 1,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  // Backend returns margin už jako 38.2 (= 38.2%), ne 0.382. Žádné násobení.
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(fractionDigits)} %`;
}

// Mapping plné jméno → 2-znakový kód do route badge ("BR → CA"), matchne
// iPad mockup leaderboard.
const CITY_SHORT: Record<string, string> = {
  Bridgewatch: 'BR',
  Martlock: 'MT',
  Lymhurst: 'LY',
  Thetford: 'TF',
  'Fort Sterling': 'FS',
  Caerleon: 'CA',
};

export function shortCity(name: string | undefined | null): string {
  if (!name) return '—';
  return CITY_SHORT[name] ?? name.slice(0, 2).toUpperCase();
}

export function formatRoute(from?: string | null, to?: string | null, language: 'cs' | 'en' = 'cs'): string {
  if (!from && !to) return '—';
  if (!to || from === to) return language === 'en' ? `${from ?? ''} local` : `${from ?? ''} lokálně`;
  return `${shortCity(from)} → ${shortCity(to)}`;
}

// Freshness — backend zatím konkrétní stringovou hodnotu nevrací, takže
// odvodíme z volume. <5 = cold, <15 = stale, jinak hot.
export type Freshness = 'hot' | 'stale' | 'cold';

export function freshnessFromVolume(volume: number | null | undefined): Freshness {
  const v = volume ?? 0;
  if (v < 5) return 'cold';
  if (v < 15) return 'stale';
  return 'hot';
}

export function freshnessColor(level: Freshness): string {
  switch (level) {
    case 'hot':
      return colors.freshHot;
    case 'stale':
      return colors.freshStale;
    case 'cold':
      return colors.freshCold;
  }
}

// "T5 · cloth" eyebrow. Kategorie jsou v engine jako `PLATE_ARMOR`,
// `CLOTH_ROBE` apod. — cleanup pro UI.
export function formatTierCategory(
  tier: number | null | undefined,
  category: string | null | undefined,
): string {
  const t = tier ? `T${tier}` : '';
  const c = category
    ? category
        .toLowerCase()
        .replace(/_/g, ' ')
    : '';
  return [t, c].filter(Boolean).join(' · ');
}

// Mapping kategorie → emoji ikona (mockup používá emoji, dokud nedoplníme
// vlastní ikon set). Drž v jednom místě.
const CATEGORY_EMOJI: Record<string, string> = {
  CLOTH_ROBE: '👘',
  CLOTH_HELMET: '🎓',
  CLOTH_SHOES: '👟',
  PLATE_ARMOR: '🛡️',
  PLATE_HELMET: '⛑️',
  PLATE_SHOES: '🥾',
  LEATHER_ARMOR: '🧥',
  LEATHER_HELMET: '🎯',
  LEATHER_SHOES: '👢',
  SWORD: '⚔️',
  AXE: '🪓',
  BOW: '🏹',
  FIRE_STAFF: '🔥',
  FIRESTAFF: '🔥',
  HOLY_STAFF: '✨',
  HOLYSTAFF: '✨',
  FROST_STAFF: '❄️',
  FROSTSTAFF: '❄️',
  ARCANE_STAFF: '🔮',
  ARCANESTAFF: '🔮',
  CURSED_STAFF: '💀',
  CURSEDSTAFF: '💀',
  NATURE_STAFF: '🌿',
  NATURESTAFF: '🌿',
  DAGGER: '🗡️',
  HAMMER: '🔨',
  MACE: '⚒️',
  SPEAR: '🔱',
  SHIELD: '🛡️',
  PIE: '🥧',
  SOUP: '🍲',
  OMELETTE: '🍳',
  STEW: '🥘',
  SALAD: '🥗',
  SANDWICH: '🥪',
  ROAST: '🍖',
  POTION: '🧪',
};

export function categoryEmoji(category: string | null | undefined): string {
  if (!category) return '✦';
  const upper = category.toUpperCase();
  return CATEGORY_EMOJI[upper] ?? '✦';
}

// Oficiální Albion render API — vrací PNG ikonu daného itemu.
// Formát URL: https://render.albiononline.com/v1/item/{item_id}.png?size=128
// Enchant: item_id obsahuje "@N" suffix (např. "T4_ARMOR_PLATE_SET1@1") nebo
// použijeme query param `enchantment`. Endpoint umí oboje, držíme se path-style.
// Quality (1-5) je optional, default = normal.
export function albionItemIconUrl(
  itemId: string | null | undefined,
  opts: { size?: number; quality?: number } = {},
): string | null {
  if (!itemId) return null;
  const size = opts.size ?? 128;
  const params = new URLSearchParams();
  params.set('size', String(size));
  if (opts.quality) params.set('quality', String(opts.quality));
  return `https://render.albiononline.com/v1/item/${encodeURIComponent(
    itemId,
  )}.png?${params.toString()}`;
}
