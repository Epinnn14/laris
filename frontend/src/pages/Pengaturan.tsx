import { useEffect, useState } from "react";
import { api, type AppState, type Business, type Settings } from "../api";
import { t, useLang } from "../i18n";
import { num } from "../format";
import { type Prefs } from "../prefs";
import { EMPTY_PROFILE, HabitFields, ShopFields, type ProfileValue } from "../profile";
import { ErrorBox, Loading, PageHead, Segmented, toast, useApi } from "../ui";

export default function Pengaturan({ state, prefs, onChange }: { state: AppState; prefs: Prefs; onChange: () => void }) {
  useLang();
  const s = useApi<Settings>("/settings");
  const [p, setP] = useState<ProfileValue>(EMPTY_PROFILE);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (s.data) {
      const d = s.data;
      setP({ shop_name: d.shop_name, owner_name: d.owner_name, business: d.business, location: d.location, city: d.city,
             open_days: d.open_days, cycle_days: d.cycle_days, target_revenue: d.target_revenue, target_margin: d.target_margin });
    }
  }, [s.data]);
  if (s.error) return <ErrorBox message={s.error} retry={s.reload} />;
  if (!s.data) return <Loading />;
  const set = (x: Partial<ProfileValue>) => setP((v) => ({ ...v, ...x }));

  const save = async () => {
    setSaving(true);
    try { await api.put("/settings", p); toast(t("Pengaturan disimpan")); onChange(); s.reload(); }
    catch (e) { toast((e as Error).message); } finally { setSaving(false); }
  };
  const demo = async (b: Business) => {
    if (!confirm(t("Semua menu, bahan, penjualan, stok, dan pengeluaran akan DIGANTI dengan data contoh. Lanjutkan?"))) return;
    setBusy(true);
    try { await api.post("/demo", { business: b }); toast(t("Data contoh dimuat")); onChange(); window.location.hash = "#/beranda"; }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const logout = async () => { await api.post("/logout"); onChange(); };
  const valid = p.shop_name.trim().length > 0 && p.open_days.length > 0;

  return (
    <>
      <PageHead title={t("Pengaturan")} />
      <div className="stack" style={{ maxWidth: 680, gap: 16 }}>
        <section className="card" aria-labelledby="pf-h">
          <div className="card-head"><h2 id="pf-h">{t("Profil usaha")}</h2></div>
          <div className="card-body stack" style={{ gap: 16 }}><ShopFields v={p} set={set} /></div>
        </section>
        <section className="card" aria-labelledby="hb-h">
          <div className="card-head"><h2 id="hb-h">{t("Cara berjualan dan target")}</h2></div>
          <div className="card-body stack" style={{ gap: 16 }}><HabitFields v={p} set={set} /></div>
          <div className="card-foot row">
            <button className="btn primary" onClick={save} disabled={saving || !valid}>{saving ? t("Menyimpan…") : t("Simpan perubahan")}</button>
          </div>
        </section>
        <section className="card pad stack" aria-labelledby="look-h">
          <h2 id="look-h">{t("Tampilan dan bahasa")}</h2>
          <div className="field">
            <span className="label">{t("Tampilan")}</span>
            <Segmented label={t("Tampilan")} value={prefs.theme} onChange={prefs.setTheme}
                       options={[{ value: "system", label: t("Ikuti HP") }, { value: "light", label: t("Terang") }, { value: "dark", label: t("Gelap") }]} />
            <span className="hint">{t("Tampilan gelap lebih nyaman di malam hari. Pilihan ini berlaku untuk perangkat ini saja.")}</span>
          </div>
          <div className="field">
            <span className="label">{t("Bahasa")}</span>
            <Segmented label={t("Bahasa")} value={prefs.lang} onChange={prefs.setLang}
                       options={[{ value: "id", label: "Bahasa Indonesia" }, { value: "en", label: "English" }]} />
          </div>
        </section>
        <section className="card pad stack" aria-labelledby="data-h">
          <h2 id="data-h">{t("Data")}</h2>
          <a className="btn" style={{ alignSelf: "flex-start" }} href="/api/export/sales.csv">{t("Unduh semua penjualan (CSV)")}</a>
          <div className="small muted">{t("Bisa dibuka di Excel atau Google Sheets.")}</div>
          {!state.demo_mode && (
            <>
              <hr className="rule" />
              <div className="small">{t("Ingin mencoba dulu? Data contoh menggantikan semua data toko ini.")}</div>
              <div className="row wrap">
                <button className="btn" disabled={busy} onClick={() => demo("warung_makan")}>{t("Muat contoh warung makan")}</button>
                <button className="btn" disabled={busy} onClick={() => demo("kafe")}>{t("Muat contoh kafe")}</button>
              </div>
            </>
          )}
        </section>
        <section className="card pad stack" aria-labelledby="m-h">
          <h2 id="m-h">{t("Model prediksi")}</h2>
          <div className="small">{state.model.available
            ? t("LarisNet aktif ({n} parameter), berjalan di komputer ini tanpa internet.", { n: num(state.model.params ?? 0) })
            : t("File model belum ada. Prediksi memakai rata-rata hari yang sama.")}</div>
        </section>
        {!state.demo_mode && <button className="btn" style={{ alignSelf: "flex-start" }} onClick={logout}>{t("Keluar")}</button>}
      </div>
    </>
  );
}
