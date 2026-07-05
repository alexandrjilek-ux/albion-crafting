import { apiFetch } from './client';
import type { BonusCalendarResponse, BonusEntry } from './types';

const DAILY_FALLBACK: BonusEntry[] = [
  { code: 'COMMON_SWORD', label: 'Swords' },
  { code: 'COMMON_AXE', label: 'Axes' },
  { code: 'COMMON_CROSSBOW', label: 'Crossbows' },
  { code: 'COMMON_HAMMER', label: 'Hammers' },
  { code: 'COMMON_MACE', label: 'Maces' },
  { code: 'COMMON_KNUCKLES', label: 'Knuckles' },
  { code: 'COMMON_PLATE_HELMET', label: 'Plate Helmets' },
  { code: 'COMMON_PLATE_ARMOR', label: 'Plate Armor' },
  { code: 'COMMON_PLATE_SHOES', label: 'Plate Shoes' },
  { code: 'COMMON_SPEAR', label: 'Spears' },
  { code: 'COMMON_BOW', label: 'Bows' },
  { code: 'COMMON_NATURESTAFF', label: 'Nature Staffs' },
  { code: 'COMMON_DAGGER', label: 'Daggers' },
  { code: 'COMMON_QUARTERSTAFF', label: 'Quarterstaffs' },
  { code: 'COMMON_SHAPESHIFTERSTAFF', label: 'Shapeshifter Staffs' },
  { code: 'COMMON_LEATHER_HELMET', label: 'Leather Helmets' },
  { code: 'COMMON_LEATHER_ARMOR', label: 'Leather Armor' },
  { code: 'COMMON_LEATHER_SHOES', label: 'Leather Shoes' },
  { code: 'COMMON_ARCANESTAFF', label: 'Arcane Staffs' },
  { code: 'COMMON_CURSESTAFF', label: 'Curse Staffs' },
  { code: 'COMMON_FIRESTAFF', label: 'Fire Staffs' },
  { code: 'COMMON_FROSTSTAFF', label: 'Frost Staffs' },
  { code: 'COMMON_HOLYSTAFF', label: 'Holy Staffs' },
  { code: 'COMMON_CLOTH_HELMET', label: 'Cloth Helmets' },
  { code: 'COMMON_CLOTH_ARMOR', label: 'Cloth Armor' },
  { code: 'COMMON_CLOTH_SHOES', label: 'Cloth Shoes' },
  { code: 'COMMON_OFFHAND', label: 'Off-Hands' },
  { code: 'COMMON_FIBER', label: 'Fiber' },
  { code: 'COMMON_WOOD', label: 'Wood' },
  { code: 'COMMON_ROCK', label: 'Rock' },
  { code: 'COMMON_ORE', label: 'Ore' },
  { code: 'COMMON_HIDE', label: 'Hide' },
  { code: 'COMMON_TOOLS', label: 'Tools' },
  { code: 'COMMON_GATHERERGEAR', label: 'Gatherer Gear' },
  { code: 'COMMON_POTION', label: 'Potions' },
  { code: 'COMMON_FOOD', label: 'Food' },
  { code: 'COMMON_BAG', label: 'Bags' },
  { code: 'COMMON_CAPE', label: 'Capes' },
];

const ACTIVITY_FALLBACK: BonusEntry[] = [
  { code: 'HELLGATE', label: 'Hellgate Frenzy', duration_days_min: 2, duration_days_max: 3 },
  { code: 'CORRUPTED', label: 'Corrupted Dungeoneering', duration_days_min: 2, duration_days_max: 3 },
  { code: 'HELLDUNGEON', label: 'Call of the Depths', duration_days_min: 2, duration_days_max: 3 },
  { code: 'FACTIONPOINTS', label: 'Faction Rivalry', duration_days_min: 2, duration_days_max: 3 },
  { code: 'GROUP_AND_RAID_DUNGEONS', label: 'Gather Your Party', duration_days_min: 2, duration_days_max: 3 },
  { code: 'STATIC_DUNGEONS', label: 'Invade the Enemy Strongholds', duration_days_min: 2, duration_days_max: 3 },
  { code: 'SOLO_DUNGEONS', label: 'Solo Dungeoneering', duration_days_min: 2, duration_days_max: 3 },
  { code: 'ROAMING_MOBS', label: 'Roam the Open World', duration_days_min: 2, duration_days_max: 3 },
  { code: 'ROADS', label: 'Roads of Avalon', duration_days_min: 2, duration_days_max: 3 },
  { code: 'MISTS', label: 'Mist Opportunities', duration_days_min: 2, duration_days_max: 3 },
  { code: 'FAME', label: 'Fame Rush', duration_days_min: 2, duration_days_max: 3 },
];

const GATHERING_FALLBACK: BonusEntry[] = [
  { code: 'ORE', label: 'Gathering Bonus: Ore', duration_days_min: 2, duration_days_max: 3 },
  { code: 'ROCK', label: 'Gathering Bonus: Stone', duration_days_min: 2, duration_days_max: 3 },
  { code: 'WOOD', label: 'Gathering Bonus: Wood', duration_days_min: 2, duration_days_max: 3 },
  { code: 'FIBER', label: 'Gathering Bonus: Fiber', duration_days_min: 2, duration_days_max: 3 },
  { code: 'HIDE', label: 'Gathering Bonus: Hide', duration_days_min: 2, duration_days_max: 3 },
  { code: 'FISHING', label: 'Gathering Bonus: Fishing', duration_days_min: 2, duration_days_max: 3 },
  { code: 'TRACKING', label: 'The Great Hunt', duration_days_min: 2, duration_days_max: 3 },
];

export async function fetchBonusCalendar(): Promise<BonusCalendarResponse> {
  try {
    return await apiFetch<BonusCalendarResponse>('/bonus-calendar', {
      method: 'GET',
      timeoutMs: 30_000,
    });
  } catch {
    return fallbackBonusCalendar();
  }
}

function fallbackBonusCalendar(): BonusCalendarResponse {
  return {
    daily_crafting: DAILY_FALLBACK,
    rotating_activities: ACTIVITY_FALLBACK,
    rotating_gathering: GATHERING_FALLBACK,
    source_url: 'bundled-fallback',
    source_updated_label: null,
    exact_week_schedule_available: false,
    note: 'Backend calendar source was unavailable, so the app is using the bundled fallback bonus list.',
    generated_at: new Date().toISOString(),
  };
}
