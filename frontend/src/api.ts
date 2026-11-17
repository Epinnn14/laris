// Thin client for the Laris API. Session is an http-only cookie, so no token handling here.

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
    let msg = `Terjadi kesalahan (${res.status})`;
    try {
      const j = await res.json();
      if (typeof j.detail === "string") msg = j.detail;
      else if (Array.isArray(j.detail)) msg = "Isian belum lengkap atau tidak valid";
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

export type Category = "makanan" | "camilan" | "minuman_dingin" | "minuman_panas";
export type Business = "warung_makan" | "kafe";

export interface AppState {
  setup_needed: boolean;
  authed: boolean;
  demo_mode: boolean;
  shop_name: string;
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
}

export interface Dashboard {
  period: { start: string; end: string; days: number };
  kpi: {
    revenue: number; revenue_change: number | null; profit: number; profit_change: number | null;
    portions: number; portions_change: number | null; avg_per_open_day: number; open_days: number; waste_cost: number;
  };
  series: DayPoint[];
  items: {
    id: number; name: string; category: Category; qty: number; revenue: number; profit: number;
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
  margin: number | null; recipe: RecipeLine[];
}

export interface Ingredient {
  id: number; name: string; unit: "g" | "ml" | "pcs"; cost_per_unit: number; shelf_life_days: number;
  lead_time_days: number; pack_size: number; pack_name: string; active: boolean; on_hand: number;
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

export interface Settings { shop_name: string; business: Business; cycle_days: string; service_level: string }
