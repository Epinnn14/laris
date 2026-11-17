import { useState, type FormEvent } from "react";
import { api, type Business } from "../api";
import { Icon } from "../ui";

export default function Masuk({ setup, onDone }: { setup: boolean; onDone: () => void }) {
  const [name, setName] = useState("");
  const [business, setBusiness] = useState<Business>("warung_makan");
  const [password, setPassword] = useState("");
  const [demo, setDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (setup) await api.post("/setup", { shop_name: name, business, password, demo });
      else await api.post("/login", { password });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="card pad stack" onSubmit={submit} style={{ gap: 16 }}>
        <div className="row" style={{ gap: 12 }}>
          <span className="brand-mark" style={{ width: 40, height: 40 }}><Icon.logo size={26} /></span>
          <div>
            <h1>Laris</h1>
            <div className="muted small">Catat penjualan, pantau bahan, tahu besok harus belanja apa.</div>
          </div>
        </div>
        {setup ? (
          <>
            <div className="field">
              <label htmlFor="shop">Nama usaha</label>
              <input id="shop" className="input" value={name} onChange={(e) => setName(e.target.value)}
                     placeholder="Contoh: Warung Bu Sri" required maxLength={80} />
            </div>
            <div className="field">
              <label htmlFor="biz">Jenis usaha</label>
              <select id="biz" className="input" value={business} onChange={(e) => setBusiness(e.target.value as Business)}>
                <option value="warung_makan">Warung makan</option>
                <option value="kafe">Kafe / kedai kopi</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="pw">Kata sandi</label>
              <input id="pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                     minLength={4} required autoComplete="new-password" />
              <span className="hint">Minimal 4 karakter. Dipakai untuk masuk dari HP atau laptop lain.</span>
            </div>
            <label className="check">
              <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
              Isi dengan data contoh setahun supaya bisa langsung dicoba
            </label>
          </>
        ) : (
          <div className="field">
            <label htmlFor="pw">Kata sandi</label>
            <input id="pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                   required autoComplete="current-password" />
          </div>
        )}
        {error && <div className="alert bad" role="alert">{error}</div>}
        <button className="btn primary" disabled={busy}>{busy ? "Sebentar…" : setup ? "Buat toko" : "Masuk"}</button>
      </form>
    </div>
  );
}
