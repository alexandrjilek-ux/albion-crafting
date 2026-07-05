// TypeScript zrcadlo Pydantic schémat z backend/app/schemas/.
// Pokud backend přidá pole, doplň je tady — `rows` jsou dnes záměrně
// `Record<string, unknown>` (engine vrací 30+ polí, FE projektuje subset).

// ─── shared (common.py) ─────────────────────────────────────────────────

export type CityName =
  | 'Bridgewatch'
  | 'Martlock'
  | 'Lymhurst'
  | 'Thetford'
  | 'Fort Sterling'
  | 'Caerleon';

export const ROYAL_CITIES: ReadonlyArray<CityName> = [
  'Bridgewatch',
  'Martlock',
  'Lymhurst',
  'Thetford',
  'Fort Sterling',
  'Caerleon',
];

// 'auto' = compare all royal cities and pick the best craft city per item.
export const AUTO_CITY = 'auto' as const;
export type CityOrAuto = CityName | typeof AUTO_CITY;

export type SortKey =
  | 'silver_per_focus'
  | 'profit_focus'
  | 'profit_no_focus'
  | 'margin_focus_%';

export type AnalysisMode = 'equipment' | 'food';
export type MarketMode = 'all' | 'royal_no_caerleon' | 'black_market_only';

export interface ErrorResponse {
  detail: string;
}

// ─── /items/top (items.py) ───────────────────────────────────────────────

export interface TopItemsRequest {
  city?: CityOrAuto;
  tiers?: number[];
  enchants?: number[];
  mode?: AnalysisMode;
  use_focus?: boolean;
  focus_budget?: number;
  top?: number;
  sort_by?: SortKey;
  min_volume?: number;
  history_days?: number;
  spec_level?: number;
  station_fee?: number;
  bonus_only?: boolean;
  no_caerleon?: boolean;
  market_mode?: MarketMode;
  activity_bonus_categories?: string[];
}

// Each row from the analytical engine has 30+ fields. Backend types it as
// Dict[str, Any] on purpose, so frontend reads narrowly. Add fields you
// actually consume here; everything else stays in `extra`.
export interface TopItemRow {
  // Identity
  item_id?: string;
  item_name?: string;
  unique_name?: string; // canonical AODP id
  category?: string;
  tier?: number;
  enchant?: number;

  // Profit numerics
  expected_profit?: number;
  profit_focus?: number;
  profit_no_focus?: number;
  profit_focus_conservative?: number;
  profit_no_focus_conservative?: number;
  silver_per_focus?: number;
  silver_per_focus_conservative?: number;
  'margin_focus_%'?: number;
  'margin_no_focus_%'?: number;
  margin_focus?: number;
  risk_adjusted_daily_profit?: number;
  raw_daily_profit?: number;
  focus_cost?: number;
  batch_size?: number;
  crafts_with_focus?: number;
  _daily_profit?: number;
  _daily_profit_raw?: number;
  confidence_score?: number;
  risk_label?: 'high' | 'medium' | 'low' | string;
  risk_flags?: string[];
  sell_price_conservative?: number;
  sell_price_source?: string;
  sellable_crafts_estimate?: number;
  sell_price?: number;
  net_revenue?: number;
  net_revenue_conservative?: number;
  eff_cost_no_focus?: number;
  eff_cost_focus?: number;
  nominal_cost?: number;
  resource_breakdown?: ResourceBreakdownRow[];
  history?: HistoryPoint[] | null;

  // Trade route
  craft_city?: string;
  sell_city?: string;

  // Volume / freshness
  daily_volume?: number;
  avg_daily_volume?: number;
  freshness?: 'hot' | 'stale' | 'cold' | string;

  // Catch-all so we never silently drop unknown engine fields.
  [extra: string]: unknown;
}

export interface ResourceBreakdownRow {
  id?: string;
  qty?: number;
  price_per_unit?: number;
  subtotal?: number;
  price_source?: string;
  price_updated?: string;
}

export interface TopItemsResponse {
  rows: TopItemRow[];
  count: number;
  mode: AnalysisMode;
  craft_city: string;
  sort_by: string;
  use_focus: boolean;
  focus_budget: number;
  tiers: number[];
  market_mode?: MarketMode | string | null;
  generated_at: string; // ISO-8601 UTC
  warning?: string | null;
}

export interface ItemSearchResult {
  unique_name: string;
  name: string;
  tier?: number | null;
  category?: string | null;
}

export interface ItemSearchResponse {
  rows: ItemSearchResult[];
  count: number;
  query: string;
}

// ─── Async job (POST /items/top/start + GET /items/top/progress/{id}) ───

export interface JobStartResponse {
  job_id: string;
}

// Backend vrací jediný objekt — discriminated union přes `status`.
export type JobProgressResponse =
  | {
      status: 'running';
      progress: string;
      step: number;
      total: number;
      started_at: number;
    }
  | {
      status: 'done';
      progress: string;
      step: number;
      total: number;
      started_at: number;
      finished_at: number;
      result: TopItemsResponse;
    }
  | {
      status: 'error';
      progress?: string;
      error: string;
      error_kind: 'value' | 'upstream' | string;
      started_at: number;
      finished_at: number;
    };

// ─── /items/{unique_name} (item_detail.py) ─────────────────────────────

export interface RecipeMaterial {
  unique_name: string;
  name: string;
  count: number;
}

export interface Recipe {
  item_id: string;
  name: string;
  focus_cost?: number | null;
  silver_fee?: number | null;
  time_seconds?: number | null;
  materials: RecipeMaterial[];
  source?: string | null;
}

export interface CityPrice {
  city: string;
  sell_min: number;
  buy_max: number;
  sell_updated: string;
  buy_updated: string;
}

export interface MaterialPrices {
  unique_name: string;
  name: string;
  count: number;
  prices: CityPrice[];
}

export interface HistoryPoint {
  date: string;
  avg_price: number;
  item_count: number;
}

export interface CityHistory {
  city: string;
  points: HistoryPoint[];
}

export interface ItemDetailResponse {
  unique_name: string;
  base_id: string;
  enchant: number;
  name: string;
  tier?: number | null;
  category?: string | null;
  icon_url: string;

  recipe?: Recipe | null;
  item_prices: CityPrice[];
  material_prices: MaterialPrices[];
  history: CityHistory[];

  history_days: number;
  generated_at: string;
  warning?: string | null;
}

// ─── /refining (refining.py) ─────────────────────────────────────────────

export interface RefiningRequest {
  tiers?: number[];
  focus_budget?: number;
  investment_budget?: number;
  material?: RefiningMaterial | null;
  buy_city?: CityOrAuto;
  refine_city?: CityOrAuto;
  sell_city?: CityOrAuto;
  history_days?: number;
  price_mode?: 'current' | 'average';
  usage_fee_pct?: number;
  market_tax_pct?: number;
  return_rate_preset?: 'bonus_city' | 'royal_city' | 'royal_island' | 'royal_island_bonus' | 'custom';
  custom_return_rate_pct?: number | null;
  profitable_only?: boolean;
  max_stale_hours?: number;
  min_volume?: number;
  bonus_only?: boolean;
  activity_bonus_categories?: string[];
}

export type RefiningMaterial = 'METALBAR' | 'PLANKS' | 'LEATHER' | 'CLOTH' | 'STONEBLOCK';

export interface RefiningRow {
  mat_type?: string;
  mat_label?: string;
  mat_emoji?: string;
  refined_id?: string;
  tier?: number;
  buy_city?: string;
  refine_city?: string;
  sell_city?: string;
  has_bonus?: boolean;
  has_activity_bonus?: boolean;
  activity_bonus_rr_pct?: number;
  use_focus?: boolean;
  nominal_cost?: number;
  nominal_cost_conservative?: number;
  eff_cost?: number;
  eff_cost_conservative?: number;
  station_fee?: number;
  station_fee_conservative?: number;
  total_cost?: number;
  total_cost_conservative?: number;
  sell_price?: number;
  sell_price_conservative?: number;
  sell_updated?: string;
  usage_fee_pct?: number;
  market_tax_pct?: number;
  price_mode?: string;
  return_rate_preset?: string;
  max_buy_price_raw_break_even?: number;
  net_revenue?: number;
  net_revenue_conservative?: number;
  profit?: number;
  profit_conservative?: number;
  silver_per_focus?: number;
  silver_per_focus_conservative?: number;
  rr_pct?: number;
  focus_cost?: number;
  margin_pct?: number;
  margin_pct_conservative?: number;
  transport_fee?: number;
  input_weight_kg?: number;
  output_weight_kg?: number;
  input_transport_fee?: number;
  output_transport_fee?: number;
  transport_label?: string;
  avg_daily_vol?: number;
  confidence_score?: number;
  risk_label?: 'low' | 'medium' | 'high' | string;
  risk_flags?: string[];
  sellable_crafts_estimate?: number;
  daily_crafts_estimate?: number;
  budget_crafts_estimate?: number;
  silver_budget_crafts_estimate?: number;
  focus_budget_crafts_estimate?: number;
  profit_per_run?: number;
  profit_per_run_conservative?: number;
  profit_for_focus_budget?: number;
  profit_for_investment_budget?: number;
  purchase_cost_conservative?: number;
  investment_required?: number;
  net_revenue_for_budget?: number;
  roi_pct?: number;
  raw_daily_profit?: number;
  risk_adjusted_daily_profit?: number;
  input_breakdown?: RefiningInputBreakdown[];
  [extra: string]: unknown;
}

export interface RefiningInputBreakdown {
  item_id?: string;
  qty?: number;
  buy_city?: string;
  price?: number;
  price_conservative?: number;
  subtotal?: number;
  subtotal_conservative?: number;
  updated?: string;
}

export interface RefiningResponse {
  rows: RefiningRow[];
  count: number;
  tiers: number[];
  focus_budget: number;
  investment_budget: number;
  material: string | null;
  buy_city: string;
  refine_city: string;
  sell_city: string;
  bonus_only: boolean;
  price_mode: string;
  usage_fee_pct: number;
  market_tax_pct: number;
  return_rate_preset: string;
  profitable_only: boolean;
  max_stale_hours: number;
  activity_bonus_categories: string[];
  generated_at: string;
}

// ─── /leveling-cost (leveling.py) ────────────────────────────────────────

export interface LevelingRequest {
  city?: string;
  use_journal?: boolean;
}

export interface LevelingRow {
  item_id?: string;
  item_name?: string;
  category?: string;
  silver_per_fame?: number;
  total_silver_cost?: number;
  total_fame?: number;
  [extra: string]: unknown;
}

export interface LevelingResponse {
  rows: LevelingRow[];
  count: number;
  city: string;
  use_journal: boolean;
  generated_at: string;
}

// ─── /bonus-calendar (bonus_calendar.py) ────────────────────────────────

export interface BonusEntry {
  code: string;
  label: string;
  duration_days_min?: number | null;
  duration_days_max?: number | null;
}

export interface BonusCalendarResponse {
  daily_crafting: BonusEntry[];
  rotating_activities: BonusEntry[];
  rotating_gathering: BonusEntry[];
  source_url: string;
  source_updated_label?: string | null;
  exact_week_schedule_available: boolean;
  note: string;
  generated_at: string;
}

// ─── /transport (transport.py) ───────────────────────────────────────────

export interface TransportRequest {
  from_city: string;
  to_city: string;
  category: string;
  tier: number;
  num_items: number;
  item_value?: number;
}

export interface TransportResponse {
  from_city: string;
  to_city: string;
  category: string;
  tier: number;
  num_items: number;
  weight_per_item: number;
  total_weight_kg: number;
  total_fee: number;
  total_risk: number;
  total_cost: number;
  fee_per_item: number;
  method_label: string;
  is_feasible: boolean;
}

// ─── /sell (sell.py) ─────────────────────────────────────────────────────

export interface SellItemInput {
  unique_name: string;
  quantity: number;
  category?: string;
  tier?: number | null;
}

export interface SellRequest {
  from_city?: string;
  history_days?: number;
  include_black_market?: boolean;
  market_mode?: 'all' | 'royal_no_caerleon' | 'black_market_only';
  items: SellItemInput[];
}

export interface SellCityOption {
  city: string;
  sell_min: number;
  price_source?: 'sell_min' | 'black_market_buy_max' | string;
  gross_revenue: number;
  market_tax: number;
  transport_fee: number;
  net_revenue: number;
  fee_per_item: number;
  avg_daily_volume: number;
  sell_updated: string;
  confidence_score: number;
  risk_label: 'low' | 'medium' | 'high' | string;
  risk_flags: string[];
}

export interface SellItemResult {
  unique_name: string;
  quantity: number;
  category: string;
  tier?: number | null;
  best_city?: string | null;
  best_net_revenue: number;
  best_sell_min: number;
  options: SellCityOption[];
  warning?: string | null;
}

export interface SellResponse {
  rows: SellItemResult[];
  count: number;
  from_city: string;
  include_black_market: boolean;
  market_mode?: string;
  generated_at: string;
}

// ─── /cities (cities.py) ─────────────────────────────────────────────────

export interface CityBonusInfo {
  name: string;
  equipment_categories: string[];
  food_categories: string[];
  refining_material: string | null;
}

export interface CitiesResponse {
  cities: CityBonusInfo[];
  equipment_bonuses: Record<string, string[]>;
  food_bonuses: Record<string, string[]>;
}
