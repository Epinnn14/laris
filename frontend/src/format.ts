import type { Category } from "./api";
import { getLang, t } from "./i18n";

const fmt = (opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat(getLang() === "en" ? "en-US" : "id-ID", opts);

export const num = (n: number) => fmt().format(Math.round(n));
export const dec = (n: number) => fmt({ maximumFractionDigits: 1 }).format(n);

export function rupiah(n: number): string {
  return `${n < 0 ? "−" : ""}Rp${fmt().format(Math.abs(Math.round(n)))}`;
}

/** Rp1,2 jt / Rp850 rb (Rp1.2M / Rp850K in English): for charts and tight spaces. */
export function rupiahShort(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  const en = getLang() === "en";
  if (a >= 1e9) return `${s}Rp${dec(a / 1e9)}${en ? "B" : " M"}`;
  if (a >= 1e6) return `${s}Rp${dec(a / 1e6)}${en ? "M" : " jt"}`;
  if (a >= 1e3) return `${s}Rp${fmt().format(Math.round(a / 1e3))}${en ? "K" : " rb"}`;
  return `${s}Rp${fmt().format(Math.round(a))}`;
}

export function pct(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  return `${fmt({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x * 100)}%`;
}

export function change(x: number | null | undefined, against = "periode sebelumnya"): { text: string; cls: string } {
  if (x === null || x === undefined) return { text: t("belum ada pembanding"), cls: "muted" };
  const s = `${x >= 0 ? "▲" : "▼"} ${pct(Math.abs(x))}`;
  return { text: t("{s} dari {p}", { s, p: t(against) }), cls: x >= 0 ? "up" : "down" };
}

/** 2500 g -> "2,5 kg", 750 ml -> "750 ml", 12 pcs -> "12 buah". */
export function amount(v: number, unit: string): string {
  if (unit === "g") return Math.abs(v) >= 1000 ? `${dec(v / 1000)} kg` : `${num(v)} g`;
  if (unit === "ml") return Math.abs(v) >= 1000 ? `${dec(v / 1000)} ${t("liter")}` : `${num(v)} ml`;
  return `${dec(v)} ${t("buah")}`;
}

export const unitLabel = (u: string) => ({ g: t("gram"), ml: "ml", pcs: t("buah") } as Record<string, string>)[u] ?? u;

const ID = {
  d: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"],
  dl: ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],
  m: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
  ml: ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"],
};
const EN_D = {
  d: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  dl: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  m: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ml: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const names = () => (getLang() === "en" ? EN_D : ID);

export const parseDay = (s: string) => new Date(`${s}T00:00:00`);
export const dayShort = (s: string) => { const d = parseDay(s); const n = names(); return getLang() === "en" ? `${n.m[d.getMonth()]} ${d.getDate()}` : `${d.getDate()} ${n.m[d.getMonth()]}`; };
export const dayWithName = (s: string) => `${names().d[parseDay(s).getDay()]}, ${dayShort(s)}`;
export const dayLong = (s: string) => { const d = parseDay(s); return `${names().dl[d.getDay()]}, ${dayShort(s)} ${d.getFullYear()}`; };
export const weekdayShort = (s: string) => names().d[parseDay(s).getDay()];
/** 0 = Monday, as the API counts. */
export const weekdayName = (i: number) => names().dl[(i + 1) % 7];
export const weekdayAbbr = (i: number) => names().d[(i + 1) % 7];
export const monthName = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${names().ml[m - 1]} ${y}`; };
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (s: string, n: number) => { const d = parseDay(s); d.setDate(d.getDate() + n); return isoDay(d); };

export const catLabel = (c: Category) => t(({
  makanan: "Makanan", camilan: "Camilan", minuman_dingin: "Minuman dingin", minuman_panas: "Minuman panas",
  sembako: "Sembako", kebutuhan_rumah: "Kebutuhan rumah",
} as Record<Category, string>)[c]);
export const CATEGORIES: Category[] = ["makanan", "camilan", "minuman_dingin", "minuman_panas", "sembako", "kebutuhan_rumah"];

export const businessLabel = (b: string) => t(b === "kafe" ? "Kafe" : b === "kios" ? "Kios / toko kelontong" : "Warung makan");

export const LOCATIONS = ["kantor", "kampus", "perumahan", "wisata", "pasar", "lainnya"] as const;
export const locationLabel = (l: string) => t(({
  kantor: "Dekat kantor", kampus: "Dekat kampus/sekolah", perumahan: "Di perumahan", wisata: "Tempat wisata",
  pasar: "Dekat pasar", lainnya: "Lainnya",
} as Record<string, string>)[l] ?? l);

export const EXPENSE_CATS = ["gas", "listrik_air", "sewa", "gaji", "kemasan", "transport", "lainnya"] as const;
export const expenseLabel = (c: string) => t(({
  gas: "Gas", listrik_air: "Listrik & air", sewa: "Sewa tempat", gaji: "Gaji & upah", kemasan: "Kemasan & plastik",
  transport: "Bensin & ongkir", lainnya: "Lainnya",
} as Record<string, string>)[c] ?? c);

/** Rupiah typed by people: "25.000", "25rb", "1,5jt" -> number. */
export function parseRupiah(s: string): number {
  const v = s.toLowerCase().replace(/rp|\s/g, "");
  const m = v.match(/^([\d.,]+)(rb|k|jt)?$/);
  if (!m) return NaN;
  const mult = m[2] === "rb" || m[2] === "k" ? 1e3 : m[2] === "jt" ? 1e6 : 1;
  const raw = mult > 1 ? m[1].replace(",", ".") : m[1].replace(/[.,]/g, "");
  return Math.round(parseFloat(raw) * mult);
}
