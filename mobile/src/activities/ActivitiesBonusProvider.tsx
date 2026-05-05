import { createContext, type PropsWithChildren, useContext, useMemo, useState } from 'react';

import type { BonusEntry } from '../api/types';

export interface SelectedActivityBonus {
  code: string;
  label: string;
  category: string;
}

interface ActivitiesBonusContextValue {
  selectedBonuses: SelectedActivityBonus[];
  selectedCategories: string[];
  isSelected: (code: string) => boolean;
  toggleBonus: (entry: BonusEntry) => void;
  clearBonuses: () => void;
}

const ActivitiesBonusContext = createContext<ActivitiesBonusContextValue | null>(null);

const MAX_SELECTED_DAILY_BONUSES = 2;

const CATEGORY_ALIASES: Record<string, string> = {
  COMMON_ARCANESTAFF: 'ARCANE_STAFF',
  COMMON_CURSESTAFF: 'CURSED_STAFF',
  COMMON_FIRESTAFF: 'FIRE_STAFF',
  COMMON_FROSTSTAFF: 'FROST_STAFF',
  COMMON_HOLYSTAFF: 'HOLY_STAFF',
  COMMON_NATURESTAFF: 'NATURE_STAFF',
  COMMON_CLOTH_SHOES: 'CLOTH_SANDALS',
  CLOTH_SHOES: 'CLOTH_SANDALS',
};

export function normalizeActivityBonusCode(code: string): string {
  const upper = code.trim().toUpperCase();
  if (CATEGORY_ALIASES[upper]) return CATEGORY_ALIASES[upper];
  const stripped = upper.startsWith('COMMON_') ? upper.replace('COMMON_', '') : upper;
  return CATEGORY_ALIASES[stripped] ?? stripped;
}

export function ActivitiesBonusProvider({ children }: PropsWithChildren) {
  const [selectedBonuses, setSelectedBonuses] = useState<SelectedActivityBonus[]>([]);

  const value = useMemo<ActivitiesBonusContextValue>(() => {
    const selectedCodes = new Set(selectedBonuses.map((bonus) => bonus.code));

    return {
      selectedBonuses,
      selectedCategories: selectedBonuses.map((bonus) => bonus.category),
      isSelected: (code: string) => selectedCodes.has(code),
      toggleBonus: (entry: BonusEntry) => {
        setSelectedBonuses((prev) => {
          if (prev.some((bonus) => bonus.code === entry.code)) {
            return prev.filter((bonus) => bonus.code !== entry.code);
          }
          const nextBonus = {
            code: entry.code,
            label: entry.label,
            category: normalizeActivityBonusCode(entry.code),
          };
          return [...prev, nextBonus].slice(-MAX_SELECTED_DAILY_BONUSES);
        });
      },
      clearBonuses: () => setSelectedBonuses([]),
    };
  }, [selectedBonuses]);

  return (
    <ActivitiesBonusContext.Provider value={value}>
      {children}
    </ActivitiesBonusContext.Provider>
  );
}

export function useActivitiesBonuses(): ActivitiesBonusContextValue {
  const value = useContext(ActivitiesBonusContext);
  if (!value) {
    throw new Error('useActivitiesBonuses must be used inside ActivitiesBonusProvider');
  }
  return value;
}
