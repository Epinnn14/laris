import { useEffect, useState, type FormEvent } from "react";
import { api, type Category } from "../api";
import { t } from "../i18n";
import { businessLabel, catLabel, num, rupiah, weekdayAbbr } from "../format";
import { QuickPrefs, type Prefs } from "../prefs";
import { EMPTY_PROFILE, HabitFields, ShopFields, type ProfileValue } from "../profile";
import { ErrorBox, Icon, Loading, useApi } from "../ui";

interface CatalogItem { key: string; name: string; category: Category; price: number }
type Start = "demo" | "menu";

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

const STEPS = ["Tentang usaha", "Cara berjualan", "Menu yang dijual", "Kata sandi"];

type OwnItem = { name: string; category: Category; price: number; cost: number };
const emptyItem = (business: string): OwnItem => ({ name: "", category: business === "kios" ? "sembako" : "makanan", price: 0, cost: 0 });

function SignUp({ lang, onDone }: { lang: string; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<ProfileValue>(EMPTY_PROFILE);
  const set = (x: Partial<ProfileValue>) => setP((v) => ({ ...v, ...x }));
  const [start, setStart] = useState<Start>("menu");
  const [picked, setPicked] = useState<Map<string, number>>(new Map());   // sample key -> the owner's price
  const [own, setOwn] = useState<OwnItem[]>([emptyItem("warung_makan")]);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a kios has no sample year of sales; a different business has a different sample menu
  useEffect(() => { if (p.business === "kios" && start === "demo") setStart("menu"); }, [p.business, start]);
  useEffect(() => { setPicked(new Map()); setOwn([emptyItem(p.business)]); }, [p.business]);

  const ownFilled = own.filter((o) => o.name.trim());
  const menuCount = picked.size + ownFilled.length;
  const menuOk = start === "demo" || (menuCount > 0 && ownFilled.every((o) => o.price > 0) && [...picked.values()].every((v) => v > 0));
  const valid = [
    p.shop_name.trim().length > 0,
    p.open_days.length > 0 && p.target_revenue > 0,
    menuOk,
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
      await api.post("/setup", {
        ...p, shop_name: p.shop_name.trim(), language: lang, password: pw, start: start === "demo" ? "demo" : "catalog",
        catalog_items: [...picked.keys()], catalog_prices: Object.fromEntries(picked),
        own_items: ownFilled.map((o) => ({ name: o.name.trim(), category: o.category, price: o.price, cost: o.cost || null })),
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const kios = p.business === "kios";

  return (
    <form className="card" onSubmit={next} noValidate>
      <div className="card-body stack" style={{ gap: 16 }}>
        <div>
          <div className="small muted">{t("Langkah {n} dari {m}", { n: step + 1, m: STEPS.length })}</div>
          <div className="steps" aria-hidden="true">{STEPS.map((s, i) => <i key={s} className={i <= step ? "on" : ""} />)}</div>
          <h1>{[t("Buat akun untuk usahamu"), t("Cara kamu berjualan"), kios ? t("Apa saja yang kamu jual?") : t("Menu apa saja yang kamu jual?"), t("Buat kata sandi")][step]}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{[
            t("Isi sekali saja. Semua bisa diubah nanti di Pengaturan."),
            t("Supaya prediksi dan daftar belanja cocok dengan kebiasaanmu."),
            t("Centang yang ada di contoh dan sesuaikan harganya, lalu tambahkan yang belum ada. Minimal satu."),
            t("Dipakai untuk masuk dari HP atau laptop lain."),
          ][step]}</p>
        </div>

        {step === 0 && <ShopFields v={p} set={set} />}
        {step === 1 && <HabitFields v={p} set={set} requireTarget />}
        {step === 2 && <MenuStep business={p.business} start={start} setStart={setStart} picked={picked} setPicked={setPicked}
                                 own={own} setOwn={setOwn} count={menuCount} />}
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
            <Review p={p} start={start} count={menuCount} />
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

function MenuStep({ business, start, setStart, picked, setPicked, own, setOwn, count }: {
  business: string; start: Start; setStart: (s: Start) => void; picked: Map<string, number>; setPicked: (m: Map<string, number>) => void;
  own: OwnItem[]; setOwn: (o: OwnItem[]) => void; count: number;
}) {
  const kios = business === "kios";
  const cat = useApi<{ items: CatalogItem[] }>(start === "menu" ? `/catalog?business=${business}` : null, [business, start]);
  const toggle = (m: CatalogItem) => { const n = new Map(picked); if (n.has(m.key)) n.delete(m.key); else n.set(m.key, m.price); setPicked(n); };
  const setPrice = (k: string, v: number) => { const n = new Map(picked); n.set(k, v); setPicked(n); };
  const setRow = (i: number, patch: Partial<OwnItem>) => setOwn(own.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const cats: Category[] = kios ? ["sembako", "kebutuhan_rumah", "camilan", "minuman_dingin", "minuman_panas", "makanan"]
                                : ["makanan", "camilan", "minuman_dingin", "minuman_panas"];
  return (
    <>
      {!kios && (
        <div className="stack" role="radiogroup" aria-label={t("Mulai dari mana?")} style={{ gap: 10 }}>
          <button type="button" role="radio" aria-checked={start === "menu"} className="tile" onClick={() => setStart("menu")}>
            <strong>{t("Isi menu toko saya")}</strong><span>{t("Pilih dari contoh atau tulis sendiri. Disarankan.")}</span>
          </button>
          <button type="button" role="radio" aria-checked={start === "demo"} className="tile" onClick={() => setStart("demo")}>
            <strong>{t("Coba dulu dengan data contoh")}</strong>
            <span>{t("Setahun penjualan toko contoh, supaya semua halaman langsung terisi. Bisa diganti nanti di Pengaturan.")}</span>
          </button>
        </div>
      )}
      {start === "menu" && (
        <>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ padding: 0, marginBottom: 6 }}>{kios ? t("Pilih dari contoh barang") : t("Pilih dari contoh menu")}</legend>
            {cat.error && <ErrorBox message={cat.error} retry={cat.reload} />}
            {!cat.data ? <Loading /> : (
              <div className="stack" style={{ gap: 0 }}>
                {cat.data.items.map((m) => {
                  const on = picked.has(m.key);
                  return (
                    <div key={m.key} className="row" style={{ borderBottom: "1px solid var(--rule)", padding: "4px 0", gap: 8 }}>
                      <label className="check grow">
                        <input type="checkbox" checked={on} onChange={() => toggle(m)} />
                        <span className="grow">{m.name} <span className="muted small">· {catLabel(m.category)}</span></span>
                      </label>
                      {on ? (
                        <div className="input-prefix" style={{ width: 140 }}>
                          <span aria-hidden="true">Rp</span>
                          <input className="input num" inputMode="numeric" aria-label={t("Harga jual {name}", { name: m.name })}
                                 value={picked.get(m.key) ? num(picked.get(m.key)!) : ""}
                                 onChange={(e) => setPrice(m.key, Number(e.target.value.replace(/\D/g, "")) || 0)} />
                        </div>
                      ) : <span className="num small muted">{rupiah(m.price)}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>

          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ padding: 0, marginBottom: 6 }}>{kios ? t("Barang lain yang kamu jual") : t("Menu lain yang kamu jual")}</legend>
            {own.map((o, i) => (
              <div key={i} className="own-row">
                <label className="mini grow" style={{ minWidth: 150 }}><span>{kios ? t("Nama barang") : t("Nama menu")}</span>
                  <input className="input" maxLength={120} value={o.name} onChange={(e) => setRow(i, { name: e.target.value })} /></label>
                <label className="mini" style={{ width: 150 }}><span>{t("Kategori")}</span>
                  <select className="input" value={o.category} onChange={(e) => setRow(i, { category: e.target.value as Category })}>
                    {cats.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
                  </select></label>
                <label className="mini" style={{ width: 120 }}><span>{t("Harga jual (Rp)")}</span>
                  <input className="input num" inputMode="numeric" value={o.price ? num(o.price) : ""}
                         onChange={(e) => setRow(i, { price: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
                <label className="mini" style={{ width: 130 }}><span>{t("Modal per porsi (Rp)")}</span>
                  <input className="input num" inputMode="numeric" placeholder={t("boleh kosong")} value={o.cost ? num(o.cost) : ""}
                         onChange={(e) => setRow(i, { cost: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
                {own.length > 1 && <button type="button" className="btn small ghost" style={{ alignSelf: "flex-end" }} onClick={() => setOwn(own.filter((_, j) => j !== i))} aria-label={t("Hapus baris")}>✕</button>}
                {o.name.trim() && !o.price && <span className="err" style={{ flexBasis: "100%" }}>{t("Isi harga jualnya.")}</span>}
              </div>
            ))}
            <button type="button" className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => setOwn([...own, emptyItem(business)])}>{t("+ Tambah baris")}</button>
            <span className="hint">{t("Modal = biaya bahan untuk satu porsi. Kalau belum tahu, kosongkan dulu dan isi nanti di Menu.")}</span>
          </fieldset>
          <p className={count ? "small" : "small err"} role="status">{count ? t("{n} menu akan dibuat.", { n: count }) : t("Pilih atau tulis minimal satu menu.")}</p>
        </>
      )}
    </>
  );
}

function Review({ p, start, count }: { p: ProfileValue; start: Start; count: number }) {
  const rows: [string, string][] = [
    [t("Usaha"), `${p.shop_name} · ${businessLabel(p.business)}`],
    ...(p.city ? [[t("Kota"), p.city] as [string, string]] : []),
    [t("Hari buka"), p.open_days.length === 7 ? t("Setiap hari") : p.open_days.map(weekdayAbbr).join(", ")],
    [t("Target omzet"), p.target_revenue ? t("{rp} per bulan", { rp: rupiah(p.target_revenue) }) : t("Belum ada")],
    [t("Menu"), start === "demo" ? t("Data contoh") : t("{n} menu", { n: count })],
  ];
  return (
    <table className="ledger" aria-label={t("Ringkasan isian")}>
      <tbody>{rows.map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td>{v}</td></tr>)}</tbody>
    </table>
  );
}
