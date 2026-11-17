import { useEffect, useState } from "react";
import { api, type AppState, type Business, type Settings } from "../api";
import { BUSINESS_LABEL } from "../format";
import { Loading, PageHead, toast, useApi } from "../ui";

export default function Pengaturan({ state, onChange }: { state: AppState; onChange: () => void }) {
  const s = useApi<Settings>("/settings");
  const [name, setName] = useState("");
  const [business, setBusiness] = useState<Business>("warung_makan");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (s.data) { setName(s.data.shop_name); setBusiness(s.data.business); } }, [s.data]);
  if (!s.data) return <Loading />;

  const save = async () => {
    await api.put("/settings", { shop_name: name, business });
    toast("Pengaturan disimpan");
    onChange();
  };
  const demo = async (b: Business) => {
    if (!confirm("Semua menu, bahan, penjualan, dan stok akan DIGANTI dengan data contoh. Lanjutkan?")) return;
    setBusy(true);
    try { await api.post("/demo", { business: b }); toast("Data contoh dimuat"); onChange(); window.location.hash = "#/beranda"; }
    finally { setBusy(false); }
  };
  const logout = async () => { await api.post("/logout"); onChange(); };

  return (
    <>
      <PageHead title="Pengaturan" />
      <div className="stack" style={{ maxWidth: 640 }}>
        <div className="card pad stack">
          <h2>Usaha</h2>
          <div className="field"><label htmlFor="sn">Nama usaha</label><input id="sn" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="sb">Jenis usaha</label>
            <select id="sb" className="input" value={business} onChange={(e) => setBusiness(e.target.value as Business)}>
              {Object.entries(BUSINESS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <span className="hint">Membantu model membaca pola: warung makan ramai siang, kafe ramai sore dan akhir pekan.</span></div>
          <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={save}>Simpan</button>
        </div>
        <div className="card pad stack">
          <h2>Data</h2>
          <a className="btn" style={{ alignSelf: "flex-start" }} href="/api/export/sales.csv">Unduh semua penjualan (CSV)</a>
          <div className="small muted">Bisa dibuka di Excel atau Google Sheets.</div>
          {!state.demo_mode && (
            <div className="row wrap">
              <button className="btn" disabled={busy} onClick={() => demo("warung_makan")}>Muat contoh warung makan</button>
              <button className="btn" disabled={busy} onClick={() => demo("kafe")}>Muat contoh kafe</button>
            </div>
          )}
        </div>
        <div className="card pad stack">
          <h2>Model prediksi</h2>
          <div className="small">{state.model.available
            ? `LarisNet aktif (${(state.model.params ?? 0).toLocaleString("id-ID")} parameter), berjalan di komputer ini tanpa internet.`
            : "File model belum ada. Prediksi memakai rata-rata hari yang sama."}</div>
        </div>
        {!state.demo_mode && <button className="btn" style={{ alignSelf: "flex-start" }} onClick={logout}>Keluar</button>}
      </div>
    </>
  );
}
