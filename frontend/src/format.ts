import type { Category } from "./api";

const nf = new Intl.NumberFormat("id-ID");
const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

export const num = (n: number) => nf.format(Math.round(n));

export function rupiah(n: number): string {
  return `Rp${nf.format(Math.round(n))}`;
}

/** Rp1,2 jt / Rp850 rb: for charts and tight spaces. */
export function rupiahShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `Rp${nf1.format(n / 1e9)} M`;
  if (a >= 1e6) return `Rp${nf1.format(n / 1e6)} jt`;
  if (a >= 1e3) return `Rp${nf.format(Math.round(n / 1e3))} rb`;
  return `Rp${nf.format(Math.round(n))}`;
}

export function pct(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  return `${(x * 100).toFixed(digits).replace(".", ",")}%`;
}

export function change(x: number | null | undefined): { text: string; cls: string } {
  if (x === null || x === undefined) return { text: "belum ada pembanding", cls: "muted" };
  const s = `${x >= 0 ? "▲" : "▼"} ${pct(Math.abs(x))}`;
  return { text: `${s} dari periode sebelumnya`, cls: x >= 0 ? "up" : "down" };
}

/** 2500 g -> "2,5 kg", 750 ml -> "750 ml", 12 pcs -> "12". */
export function amount(v: number, unit: string): string {
  if (unit === "g") return Math.abs(v) >= 1000 ? `${nf1.format(v / 1000)} kg` : `${nf.format(Math.round(v))} g`;
  if (unit === "ml") return Math.abs(v) >= 1000 ? `${nf1.format(v / 1000)} liter` : `${nf.format(Math.round(v))} ml`;
  return `${nf1.format(v)} buah`;
}

export const unitLabel = (u: string) => ({ g: "gram", ml: "ml", pcs: "buah" } as Record<string, string>)[u] ?? u;

const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const daysLong = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export const parseDay = (s: string) => new Date(`${s}T00:00:00`);
export const dayShort = (s: string) => { const d = parseDay(s); return `${d.getDate()} ${months[d.getMonth()]}`; };
export const dayWithName = (s: string) => { const d = parseDay(s); return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`; };
export const dayLong = (s: string) => { const d = parseDay(s); return `${daysLong[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`; };
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (s: string, n: number) => { const d = parseDay(s); d.setDate(d.getDate() + n); return isoDay(d); };

export const CATEGORY_LABEL: Record<Category, string> = {
  makanan: "Makanan",
  camilan: "Camilan",
  minuman_dingin: "Minuman dingin",
  minuman_panas: "Minuman panas",
};

export const BUSINESS_LABEL = { warung_makan: "Warung makan", kafe: "Kafe" } as const;
