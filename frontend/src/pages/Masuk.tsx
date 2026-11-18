import { useEffect, useState, type FormEvent } from "react";
import { api, type Category } from "../api";
import { t } from "../i18n";
import { businessLabel, catLabel, rupiah, weekdayAbbr } from "../format";
import { QuickPrefs, type Prefs } from "../prefs";
import { EMPTY_PROFILE, HabitFields, ShopFields, type ProfileValue } from "../profile";
import { ErrorBox, Icon, Loading, useApi } from "../ui";

interface CatalogItem { key: string; name: string; category: Category; price: number }
type Start = "demo" | "catalog" | "empty";

export default function Masuk({ setup, shopName, prefs, onDone }: {
  setup: boolean; shopName: string; prefs: Prefs; onDone: () => void;
}) {
  return (
    <div className="auth">
      <div className="auth-wrap">
        <div className="auth-top">
          <div className="row" style={{ gap: 12 }}>
            <span className="brand-mark" style={{ width: 40, height: 40 }}><Icon.logo size={26} /></span>
            <div>
              <div className="fig" style={{ fontSize: 24 }}>Laris</div>
              <div className="muted small">{t("Buku kas warung: catat jualan, pantau bahan, tahu besok belanja apa.")}</div>
            </div>
          </div>
          <QuickPrefs prefs={prefs} compact />
        </div>
        {setup ? <SignUp lang={prefs.lang} onDone={onDone} /> : <Login shopName={shopName} onDone={onDone} />}
      </div>
    </div>
  );
}

function Login({ shopName, onDone }: { shopName: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await api.post("/login", { password }); onDone(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <form className="card pad stack" onSubmit={submit} style={{ gap: 16 }}>
      <h1>{t("Masuk ke {shop}", { shop: shopName })}</h1>
      <div className="field">
        <label htmlFor="pw">{t("Kata sandi")}</label>
        <input id="pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
               required autoComplete="current-password" autoFocus />
        <span className="hint">{t("Lupa kata sandi? Di laptop toko, buka jendela Laris dan tekan \"Lupa kata sandi?\".")}</span>
      </div>
      {error && <div className="alert bad" role="alert">{error}</div>}
      <button className="btn primary" disabled={busy}>{busy ? t("Sebentar…") : t("Masuk")}</button>
    </form>
  );
}

const STEPS = ["Tentang usaha", "Cara berjualan", "Mulai dari mana", "Kata sandi"];

function SignUp({ lang, onDone }: { lang: string; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<ProfileValue>(EMPTY_PROFILE);
  const set = (x: Partial<ProfileValue>) => setP((v) => ({ ...v, ...x }));
  const [start, setStart] = useState<Start>("demo");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a kios has no sample year of sales; a different business has a different sample menu
  useEffect(() => { if (p.business === "kios" && start === "demo") setStart("catalog"); }, [p.business, start]);
  useEffect(() => { setPicked(new Set()); }, [p.business]);

  const valid = [
    p.shop_name.trim().length > 0,
    p.open_days.length > 0,
    start !== "catalog" || picked.size > 0,
    pw.length >= 6 && pw === pw2,
  ];
  const next = (e: FormEvent) => {
    e.preventDefault();
    if (!valid[step]) return;
    if (step < STEPS.length - 1) { setStep(step + 1); window.scrollTo(0, 0); return; }
    create();
  };
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/setup", { ...p, shop_name: p.shop_name.trim(), language: lang, password: pw, start,
                                 catalog_items: [...picked] });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={next} noValidate>
      <div className="card-body stack" style={{ gap: 16 }}>
        <div>
          <div className="small muted">{t("Langkah {n} dari {m}", { n: step + 1, m: STEPS.length })}</div>
          <div className="steps" aria-hidden="true">{STEPS.map((s, i) => <i key={s} className={i <= step ? "on" : ""} />)}</div>
          <h1>{[t("Buat akun untuk usahamu"), t("Cara kamu berjualan"), t("Mulai dari mana?"), t("Buat kata sandi")][step]}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{[
            t("Isi sekali saja. Semua bisa diubah nanti di Pengaturan."),
            t("Supaya prediksi dan daftar belanja cocok dengan kebiasaanmu."),
            p.business === "kios" ? t("Pilih barang yang kamu jual dari contoh, atau isi sendiri dari awal.") : t("Kamu bisa mencoba dulu dengan data contoh, lalu menggantinya dengan data sendiri."),
            t("Dipakai untuk masuk dari HP atau laptop lain."),
          ][step]}</p>
        </div>

        {step === 0 && <ShopFields v={p} set={set} />}
        {step === 1 && <HabitFields v={p} set={set} />}
        {step === 2 && <StartChoice business={p.business} start={start} setStart={setStart} picked={picked} setPicked={setPicked} />}
        {step === 3 && (
          <>
            <div className="field">
              <label htmlFor="pw">{t("Kata sandi")}</label>
              <input id="pw" className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)}
                     minLength={6} required autoComplete="new-password" />
              <span className="hint">{t("Minimal 6 karakter.")}</span>
            </div>
            <div className="field">
              <label htmlFor="pw2">{t("Ulangi kata sandi")}</label>
              <input id="pw2" className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)}
                     required autoComplete="new-password" />
              {pw2 && pw !== pw2 && <span className="err" role="alert">{t("Kata sandi belum sama.")}</span>}
            </div>
            <Review p={p} start={start} picked={picked.size} />
          </>
        )}
        {error && <ErrorBox message={error} />}
      </div>
      <div className="card-foot row between">
        {step > 0 ? <button type="button" className="btn" onClick={() => setStep(step - 1)}>{t("Kembali")}</button> : <span />}
        <button className="btn primary" disabled={!valid[step] || busy}>
          {busy ? t("Menyiapkan…") : step < STEPS.length - 1 ? t("Lanjut") : t("Buat akun")}
        </button>
      </div>
    </form>
  );
}

function StartChoice({ business, start, setStart, picked, setPicked }: {
  business: string; start: Start; setStart: (s: Start) => void; picked: Set<string>; setPicked: (s: Set<string>) => void;
}) {
  const cat = useApi<{ items: CatalogItem[] }>(start === "catalog" ? `/catalog?business=${business}` : null, [business, start]);
  const options: { v: Start; title: string; text: string }[] = [
    ...(business === "kios" ? [] : [{ v: "demo" as Start, title: t("Coba dengan data contoh"), text: t("Setahun penjualan toko contoh, supaya semua halaman langsung terisi. Bisa dihapus nanti.") }]),
    { v: "catalog", title: business === "kios" ? t("Pilih barang dari contoh") : t("Pilih menu dari contoh"),
      text: business === "kios" ? t("Barang, harga beli, dan isi per dus sudah terisi. Tinggal sesuaikan harga.") : t("Menu, resep, dan bahan sudah terisi. Tinggal sesuaikan harga.") },
    { v: "empty", title: t("Mulai kosong"), text: t("Isi menu dan resep sendiri dari awal.") },
  ];
  const toggle = (k: string) => { const n = new Set(picked); if (n.has(k)) n.delete(k); else n.add(k); setPicked(n); };
  return (
    <>
      <div className="stack" role="radiogroup" aria-label={t("Mulai dari mana?")} style={{ gap: 10 }}>
        {options.map((o) => (
          <button type="button" key={o.v} role="radio" aria-checked={start === o.v} className="tile" onClick={() => setStart(o.v)}>
            <strong>{o.title}</strong><span>{o.text}</span>
          </button>
        ))}
      </div>
      {start === "catalog" && (
        <div className="field">
          <span className="label">{business === "kios" ? t("Barang yang kamu jual") : t("Menu yang kamu jual")}</span>
          {cat.error && <ErrorBox message={cat.error} retry={cat.reload} />}
          {!cat.data ? <Loading /> : (
            <div className="stack" style={{ gap: 0 }}>
              {cat.data.items.map((m) => (
                <label key={m.key} className="check" style={{ borderBottom: "1px solid var(--rule)", padding: "4px 0" }}>
                  <input type="checkbox" checked={picked.has(m.key)} onChange={() => toggle(m.key)} />
                  <span className="grow">{m.name} <span className="muted small">· {catLabel(m.category)}</span></span>
                  <span className="num small muted">{rupiah(m.price)}</span>
                </label>
              ))}
            </div>
          )}
          {picked.size === 0
            ? <span className="hint">{t("Pilih minimal satu menu.")}</span>
            : <span className="hint">{t("{n} menu dipilih.", { n: picked.size })}</span>}
        </div>
      )}
    </>
  );
}

function Review({ p, start, picked }: { p: ProfileValue; start: Start; picked: number }) {
  const rows: [string, string][] = [
    [t("Usaha"), `${p.shop_name} · ${businessLabel(p.business)}`],
    ...(p.city ? [[t("Kota"), p.city] as [string, string]] : []),
    [t("Hari buka"), p.open_days.length === 7 ? t("Setiap hari") : p.open_days.map(weekdayAbbr).join(", ")],
    [t("Target omzet"), p.target_revenue ? t("{rp} per bulan", { rp: rupiah(p.target_revenue) }) : t("Belum ada")],
    [t("Mulai dengan"), start === "demo" ? t("Data contoh") : start === "catalog" ? t("{n} menu contoh", { n: picked }) : t("Kosong")],
  ];
  return (
    <table className="ledger" aria-label={t("Ringkasan isian")}>
      <tbody>{rows.map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td>{v}</td></tr>)}</tbody>
    </table>
  );
}
