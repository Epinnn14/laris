// Thin client for the Laris API. Session is an http-only cookie, so no token handling here.
import { t } from "./i18n";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (!res.ok) {
    let msg = t("Terjadi kesalahan ({n})", { n: res.status });
    try {
      const j = await res.json();
      if (typeof j.detail === "string") msg = t(j.detail);
      else if (Array.isArray(j.detail)) msg = t("Isian belum lengkap atau tidak valid");
    } catch {
      /* not json */
    }
    if (res.status === 401) window.dispatchEvent(new Event("laris:unauthorized"));
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(p: string) => call<T>("GET", p),
  post: <T>(p: string, b?: unknown) => call<T>("POST", p, b ?? {}),
  put: <T>(p: string, b?: unknown) => call<T>("PUT", p, b ?? {}),
  del: <T>(p: string) => call<T>("DELETE", p),
};

export type Category = "makanan" | "camilan" | "minuman_dingin" | "minuman_panas" | "sembako" | "kebutuhan_rumah";
export type Business = "warung_makan" | "kafe" | "kios";

export interface AppState {
  setup_needed: boolean;
  authed: boolean;
  demo_mode: boolean;
  shop_name: string;
  owner_name: string;
  language: "id" | "en";
  business: Business;
  today: string;
  model: { available: boolean; params?: number };
}

export interface DayPoint {
  date: string;
  revenue: number;
  portions: number;
  profit: number;
  closed: boolean;
  recorded: boolean;
  level: "ramai" | "normal" | "sepi" | null;
  note: string;
  usual: number;
}

export interface Target {
  goal: number; done: number; month: string; days_left: number; open_days_left: number;
  projected: number[] | null; complete: boolean; chance: number | null; per_day_needed: number;
}

export interface Dashboard {
  period: { start: string; end: string; days: number };
  kpi: {
    revenue: number; revenue_change: number | null; profit: number; profit_change: number | null;
    portions: number; portions_change: number | null; avg_per_open_day: number; open_days: number; waste_cost: number;
    ingredient_cost: number; expenses: number; net_profit: number; net_change: number | null;
    preorder_revenue: number; preorders_done: number;
    best_day: { date: string; revenue: number } | null; quiet_day: { date: string; revenue: number } | null;
  };
  expenses: { category: string; amount: number }[];
  target: Target | null;
  target_margin: number;
  series: DayPoint[];
  items: {
    id: number; name: string; category: Category; price: number; qty: number; revenue: number; profit: number;
    margin: number | null; change: number | null; stockouts: number; abc: "A" | "B" | "C";
  }[];
  weekday: { day: string; revenue: number }[];
  categories: { category: Category; revenue: number }[];
}

export interface Forecast {
  start: string;
  dates: string[];
  method: string;
  note: string;
  closed: boolean[];
  weekly_off: number[]; // 0 = Monday
  totals: { portions: number[][]; revenue: number[][] };
  items: {
    id: number; name: string; category: Category; price: number; history_days: number;
    p10: number[]; p50: number[]; p90: number[]; week: number[];
  }[];
  backtest: { days: number; mae: number; accuracy: number; method: string } | null;
}

export interface PlanItem {
  id: number; name: string; unit: string; on_hand: number; daily: number; need: number; need_target: number;
  buy: number; packs: number; pack_name: string; cost: number; days_left: number | null; risk: number;
  capped: boolean; reason: string;
}

export interface Plan {
  start?: string;
  cycle_days: number;
  service_level?: number;
  method?: string;
  total_cost: number;
  items: PlanItem[];
}

export interface RecipeLine { ingredient_id: number; name?: string; unit?: string; amount: number }

export interface MenuItem {
  id: number; name: string; category: Category; price: number; active: boolean; unit_cost: number;
  margin: number | null; suggested_price: number | null; recipe: RecipeLine[];
  recipe_cost: number; batch_cost: number | null; batch_qty: number | null;
}

export interface Ingredient {
  id: number; name: string; unit: "g" | "ml" | "pcs"; cost_per_unit: number; shelf_life_days: number;
  lead_time_days: number; pack_size: number; pack_name: string; active: boolean; on_hand: number;
  used_in: string[];
}

export interface SalesDay {
  day: string;
  closed: boolean;
  note: string;
  recorded: boolean;
  entries: { item_id: number; name: string; category: Category; price: number; qty: number; stockout: boolean; promo: boolean }[];
}

export interface StockMove {
  id: number; day: string; ingredient_id: number; ingredient: string; unit: string; kind: string; qty: number;
  cost: number; note: string;
}

export interface Settings {
  shop_name: string; owner_name: string; business: Business; location: string; city: string; open_days: number[];
  cycle_days: number; service_level: number; target_revenue: number; target_margin: number; language: "id" | "en";
}

export interface Expense { id: number; day: string; category: string; amount: number; note: string }

export interface ItemMove { id: number; name: string; qty: number; before: number; change: number }
export interface Summary {
  start: string; end: string; missing: string[];
  days: { date: string; revenue: number; closed: boolean; recorded: boolean }[];
  revenue: number; revenue_change: number | null; portions: number; gross: number; net: number; net_before: number;
  expenses: number; waste: number;
  best_day: { date: string; revenue: number } | null; quiet_day: { date: string; revenue: number } | null;
  risers: ItemMove[]; fallers: ItemMove[];
  stockouts: { id: number; name: string; days: number }[];
  low_margin: { id: number; name: string; margin: number; price: number; suggested_price: number }[];
  target_margin: number;
  top: { id: number; name: string; qty: number; revenue: number; profit: number }[];
  weekdays: { busiest: number; busiest_revenue: number; quietest: number; quietest_revenue: number } | null;
  next_week: { method: string; revenue: number[]; closed_days: number } | null;
  buy: { name: string; cost: number; days_left: number | null }[];
  target: Target | null;
}

export interface SimSide { revenue: number[]; gross: number[]; item_qty: number[]; item_revenue: number; item_gross: number }
export interface Simulation {
  days: number; item: { id: number; name: string; price: number; unit_cost: number }; new_price: number;
  sensitivity: string; elasticity: number; method: string; promo_note: string | null; base: SimSide; what_if: SimSide;
}

export interface Order {
  id: number; number: number; day: string; time: string; total: number; method: "tunai" | "qris" | "transfer";
  cash: number | null; note: string; void: boolean; lines: { item_id: number; name: string; qty: number; price: number }[];
}

export interface TodayTill {
  day: string; orders: number; revenue: number; avg: number; last: string | null;
  methods: { method: string; amount: number }[]; top: { name: string; qty: number }[];
  hours: { hour: number; orders: number }[]; history_days: number;
}

export type PreStatus = "baru" | "proses" | "selesai" | "batal";
export interface PreOrderLine { item_id: number | null; name: string; qty: number; price: number }
export interface PreOrder {
  id: number; customer: string; phone: string; due: string; due_time: string; status: PreStatus; dp: number;
  note: string; total: number; rest: number; lines: PreOrderLine[];
}

export interface Note { id: number; text: string; pinned: boolean; updated: string }

export interface BackupStatus { available: boolean; folders: string[]; last: string | null; count: number }
