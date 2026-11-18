// The shop profile, asked once at sign-up and editable in Settings.
import type { Business } from "./api";
import { t } from "./i18n";
import { num, parseRupiah, weekdayAbbr, weekdayName } from "./format";
import { Segmented } from "./ui";

export interface ProfileValue {
  shop_name: string; owner_name: string; business: Business; location: string; city: string;
  open_days: number[]; cycle_days: number; target_revenue: number; target_margin: number;
}

export const EMPTY_PROFILE: ProfileValue = {
  shop_name: "", owner_name: "", business: "warung_makan", location: "lainnya", city: "",
  open_days: [0, 1, 2, 3, 4, 5, 6], cycle_days: 1, target_revenue: 0, target_margin: 0.6,
};

type Set = (p: Partial<ProfileValue>) => void;

/** 10% to 90%: grocery kiosks live on thin margins, food stalls on wide ones. */
export const MARGINS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

export function ShopFields({ v, set }: { v: ProfileValue; set: Set }) {
  return (
    <>
      <div className="field">
        <label htmlFor="shop">{t("Nama usaha")}</label>
        <input id="shop" className="input" value={v.shop_name} onChange={(e) => set({ shop_name: e.target.value })}
               placeholder={t("Nama warung atau kafe")} required maxLength={80} autoComplete="organization" />
      </div>
      <div className="field">
        <label htmlFor="owner">{t("Nama pemilik")} <span className="muted">({t("boleh dikosongkan")})</span></label>
        <input id="owner" className="input" value={v.owner_name} onChange={(e) => set({ owner_name: e.target.value })}
               placeholder={t("Nama Anda")} maxLength={80} autoComplete="name" />
        <span className="hint">{t("Dipakai untuk sapaan di Beranda.")}</span>
      </div>
      <div className="field">
        <span className="label" id="biz-l">{t("Jenis usaha")}</span>
        <div className="tiles" role="group" aria-labelledby="biz-l">
          <button type="button" className="tile" aria-pressed={v.business === "warung_makan"} onClick={() => set({ business: "warung_makan" })}>
            <strong>{t("Warung makan")}</strong><span>{t("Nasi, lauk, mi, gorengan, es teh")}</span>
          </button>
          <button type="button" className="tile" aria-pressed={v.business === "kafe"} onClick={() => set({ business: "kafe" })}>
            <strong>{t("Kafe / kedai kopi")}</strong><span>{t("Kopi, minuman dingin, camilan")}</span>
          </button>
          <button type="button" className="tile" aria-pressed={v.business === "kios"} onClick={() => set({ business: "kios" })}>
            <strong>{t("Kios / toko kelontong")}</strong><span>{t("Sembako, mi instan, minuman, sabun, gas")}</span>
          </button>
        </div>
      </div>
      <div className="field">
        <label htmlFor="city">{t("Kota")} <span className="muted">({t("boleh dikosongkan")})</span></label>
        <input id="city" className="input" value={v.city} onChange={(e) => set({ city: e.target.value })} maxLength={80}
               autoComplete="address-level2" />
      </div>
    </>
  );
}

export function HabitFields({ v, set, requireTarget }: { v: ProfileValue; set: Set; requireTarget?: boolean }) {
  const toggle = (d: number) => set({ open_days: v.open_days.includes(d) ? v.open_days.filter((x) => x !== d) : [...v.open_days, d].sort() });
  return (
    <>
      <div className="field">
        <span className="label" id="days-l">{t("Hari buka")}</span>
        <div className="chips" role="group" aria-labelledby="days-l">
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <button type="button" key={d} className="chip" aria-pressed={v.open_days.includes(d)} onClick={() => toggle(d)}
                    aria-label={weekdayName(d)}>{weekdayAbbr(d)}</button>
          ))}
        </div>
        {v.open_days.length === 0
          ? <span className="err" role="alert">{t("Pilih minimal satu hari buka.")}</span>
          : <span className="hint">{t("Hari libur rutin tidak perlu dicatat dan tidak dihitung sebagai hari sepi.")}</span>}
      </div>
      <div className="field">
        <span className="label" id="cyc-l">{t("Belanja bahan biasanya")}</span>
        <Segmented label={t("Belanja bahan biasanya")} value={v.cycle_days} onChange={(c) => set({ cycle_days: c })}
                   options={[{ value: 1, label: t("Tiap hari") }, { value: 2, label: t("2 hari sekali") },
                             { value: 3, label: t("3 hari sekali") }, { value: 7, label: t("Seminggu sekali") }]} />
        <span className="hint">{t("Daftar belanja menghitung bahan sampai belanja berikutnya.")}</span>
      </div>
      <RupiahField id="target" label={t("Target omzet per bulan")} optional={!requireTarget} value={v.target_revenue}
                   onChange={(n) => set({ target_revenue: n })}
                   hint={requireTarget && !v.target_revenue ? t("Isi perkiraan uang masuk sebulan yang ingin dicapai, misalnya Rp30.000.000. Bisa diubah nanti.")
                     : t("Beranda akan menunjukkan apakah target bulan ini kemungkinan tercapai.")} />
      <div className="field">
        <span className="label" id="mg-l">{t("Untung yang diinginkan dari harga jual")}</span>
        <Segmented label={t("Untung yang diinginkan dari harga jual")} value={v.target_margin} onChange={(m) => set({ target_margin: m })}
                   options={MARGINS.map((m) => ({ value: m, label: `${Math.round(m * 100)}%` }))} />
        <span className="hint">{t("Contoh 60%: dari harga Rp10.000, modal paling banyak Rp4.000. Toko kelontong biasanya 10–20%, warung makan 50–60%. Dipakai untuk saran harga di Menu.")}</span>
      </div>
    </>
  );
}

export function RupiahField({ id, label, value, onChange, hint, optional }: {
  id: string; label: string; value: number; onChange: (n: number) => void; hint?: string; optional?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}{optional && <> <span className="muted">({t("boleh dikosongkan")})</span></>}</label>
      <div className="input-prefix">
        <span aria-hidden="true">Rp</span>
        <input id={id} className="input num" inputMode="numeric" value={value ? num(value) : ""}
               onChange={(e) => { const n = parseRupiah(e.target.value || "0"); onChange(Number.isNaN(n) ? 0 : n); }} />
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
