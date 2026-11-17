// "What if": a new price or a promotion for one menu item, compared with the forecast as it is.
import { useEffect, useState } from "react";
import { api, type MenuItem, type Simulation } from "../api";
import { t, useLang } from "../i18n";
import { addDays, dayShort, num, pct, rupiah, rupiahShort } from "../format";
import { RupiahField } from "../profile";
import { ErrorBox, Loading, PageHead, Segmented, useApi } from "../ui";

type Sens = "rendah" | "sedang" | "tinggi";

export default function Simulasi({ today }: { today: string }) {
  useLang();
  const menu = useApi<MenuItem[]>("/menu");
  const [itemId, setItemId] = useState<number | null>(null);
  const [usePrice, setUsePrice] = useState(true);
  const [price, setPrice] = useState(0);
  const [sens, setSens] = useState<Sens>("sedang");
  const [usePromo, setUsePromo] = useState(false);
  const [pStart, setPStart] = useState(addDays(today, 1));
  const [pEnd, setPEnd] = useState(addDays(today, 7));
  const [res, setRes] = useState<Simulation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const item = menu.data?.find((m) => m.id === itemId) ?? null;
  useEffect(() => {
    if (menu.data?.length && itemId === null) setItemId(menu.data[0].id);
  }, [menu.data, itemId]);
  useEffect(() => { if (item) setPrice(item.price + 1000); setRes(null); }, [item]);

  if (menu.error) return <ErrorBox message={menu.error} retry={menu.reload} />;
  if (!menu.data) return <Loading />;
  if (!menu.data.length) return <><PageHead title={t("Coba hitung")} /><div className="card pad empty">{t("Tambahkan menu dulu untuk mencoba hitungan.")}</div></>;

  const run = async () => {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      setRes(await api.post<Simulation>("/simulate", {
        item_id: item.id, new_price: usePrice && price > 0 ? price : null, sensitivity: sens,
        promo_start: usePromo ? pStart : null, promo_end: usePromo ? pEnd : null,
      }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const priceOk = usePrice && !!item && price > 0 && price !== item.price;
  const valid = !!item && (!usePrice || price > 0) && (!usePromo || pEnd >= pStart) && (priceOk || usePromo);

  return (
    <>
      <PageHead title={t("Coba hitung: kalau…")}
                sub={t("Bandingkan 4 minggu ke depan seperti sekarang dengan kalau harga diubah atau ada promo. Tidak ada yang berubah sampai kamu mengubahnya sendiri di Menu.")} />
      <div className="grid two">
        <section className="card" aria-labelledby="q-h">
          <div className="card-head"><h2 id="q-h">{t("Pertanyaannya")}</h2></div>
          <div className="card-body stack" style={{ gap: 16 }}>
            <div className="field">
              <label htmlFor="it">{t("Menu")}</label>
              <select id="it" className="input" value={itemId ?? ""} onChange={(e) => setItemId(Number(e.target.value))}>
                {menu.data.map((m) => <option key={m.id} value={m.id}>{m.name} · {rupiah(m.price)}</option>)}
              </select>
              {item && <span className="hint">{t("Modal bahan {rp} per porsi.", { rp: rupiah(item.unit_cost) })}</span>}
            </div>

            <label className="check"><input type="checkbox" checked={usePrice} onChange={(e) => setUsePrice(e.target.checked)} />{t("Kalau harganya diubah")}</label>
            {usePrice && item && (
              <div className="stack" style={{ gap: 12, paddingLeft: 28 }}>
                <RupiahField id="np" label={t("Harga baru")} value={price} onChange={setPrice}
                             hint={price !== item.price ? t("{dir} {rp} dari harga sekarang", { dir: price > item.price ? t("Naik") : t("Turun"), rp: rupiah(Math.abs(price - item.price)) }) : undefined} />
                <div className="chips">
                  {[-1000, 1000, 2000, 3000].map((d) => (
                    <button key={d} type="button" className="chip" onClick={() => setPrice(Math.max(500, item.price + d))}>{d > 0 ? "+" : "−"}{rupiahShort(Math.abs(d))}</button>
                  ))}
                  {item.suggested_price && item.suggested_price > item.price && (
                    <button type="button" className="chip" onClick={() => setPrice(item.suggested_price!)}>{t("Saran: {rp}", { rp: rupiah(item.suggested_price) })}</button>
                  )}
                </div>
                <div className="field">
                  <span className="label">{t("Seberapa peka pembeli pada harga?")}</span>
                  <Segmented label={t("Seberapa peka pembeli pada harga?")} value={sens} onChange={setSens}
                             options={[{ value: "rendah", label: t("Sedikit") }, { value: "sedang", label: t("Sedang") }, { value: "tinggi", label: t("Sangat") }]} />
                  <span className="hint">{t("Laris belum punya catatan perubahan harga di tokomu, jadi ini perkiraan kasar. Pilih \"Sangat\" kalau di sekitarmu banyak yang jual menu serupa.")}</span>
                </div>
              </div>
            )}

            <label className="check"><input type="checkbox" checked={usePromo} onChange={(e) => setUsePromo(e.target.checked)} />{t("Kalau ada promo")}</label>
            {usePromo && (
              <div className="row wrap" style={{ paddingLeft: 28 }}>
                <input className="input" type="date" value={pStart} min={today} onChange={(e) => setPStart(e.target.value)} style={{ width: 170 }} aria-label={t("Mulai")} />
                <span className="muted">{t("s.d.")}</span>
                <input className="input" type="date" value={pEnd} min={pStart} onChange={(e) => setPEnd(e.target.value)} style={{ width: 170 }} aria-label={t("Selesai")} />
                <span className="hint" style={{ flexBasis: "100%" }}>{t("Efek promo dihitung oleh model dari pola promo yang pernah terjadi.")}</span>
              </div>
            )}
            {error && <ErrorBox message={error} />}
            <button className="btn primary" style={{ alignSelf: "flex-start" }} disabled={!valid || busy} onClick={run}>
              {busy ? t("Menghitung…") : t("Hitung")}
            </button>
          </div>
        </section>
        <Result res={res} busy={busy} usePromo={usePromo} pStart={pStart} pEnd={pEnd} />
      </div>
    </>
  );
}

function Result({ res, busy, usePromo, pStart, pEnd }: { res: Simulation | null; busy: boolean; usePromo: boolean; pStart: string; pEnd: string }) {
  if (busy) return <div className="card pad"><Loading label={t("Menghitung…")} /></div>;
  if (!res) return (
    <section className="card pad">
      <h2>{t("Hasilnya muncul di sini")}</h2>
      <p className="muted" style={{ marginTop: 6 }}>{t("Pilih menu, isi harga baru atau tanggal promo, lalu tekan Hitung.")}</p>
    </section>
  );
  const b = res.base, w = res.what_if;
  const dq = w.item_qty[1] - b.item_qty[1];
  const dg = w.gross[1] - b.gross[1];
  const priceChanged = res.new_price !== res.item.price;
  const what = [
    priceChanged ? t("harga {name} jadi {rp}", { name: res.item.name, rp: rupiah(res.new_price) }) : null,
    usePromo ? t("ada promo {a} – {b}", { a: dayShort(pStart), b: dayShort(pEnd) }) : null,
  ].filter(Boolean).join(t(" dan "));
  const rows = [
    { label: t("Porsi {name}", { name: res.item.name }), a: b.item_qty[1], z: w.item_qty[1], f: (v: number) => num(v) },
    { label: t("Omzet seluruh menu"), a: b.revenue[1], z: w.revenue[1], f: rupiahShort },
    { label: t("Untung setelah modal bahan"), a: b.gross[1], z: w.gross[1], f: rupiahShort },
  ];
  return (
    <section className="card" aria-labelledby="r-h" aria-live="polite">
      <div className="card-head">
        <div><h2 id="r-h">{t("Hasil untuk {n} hari ke depan", { n: res.days })}</h2>
          <p className="small muted">{t("Kalau {what}:", { what })}</p></div>
      </div>
      <div className="card-body stack" style={{ gap: 18 }}>
        <p style={{ fontSize: 18, lineHeight: 1.45 }}>
          {t("Porsi {name} {dir} sekitar {n}", { name: res.item.name, dir: dq >= 0 ? t("bertambah") : t("berkurang"), n: num(Math.abs(dq)) })}
          {b.item_qty[1] > 0 && ` (${dq >= 0 ? "+" : "−"}${pct(Math.abs(dq) / b.item_qty[1])})`}
          {", "}{t("dan untung setelah modal bahan")}{" "}
          <strong className={dg >= 0 ? "up" : "down"}>{dg >= 0 ? t("naik") : t("turun")} {rupiahShort(Math.abs(dg))}</strong>.
        </p>
        <div className="hbars">
          {rows.map((r) => {
            const max = Math.max(r.a, r.z, 1);
            return (
              <div key={r.label}>
                <div className="hbar-top"><span className="grow">{r.label}</span>
                  <span className={`num small ${r.z - r.a >= 0 ? "up" : "down"}`}>{r.z - r.a >= 0 ? "+" : "−"}{r.f(Math.abs(r.z - r.a))}</span></div>
                <div className="row" style={{ gap: 10 }}>
                  <span className="tiny muted" style={{ width: 64 }}>{t("Sekarang")}</span>
                  <div className="track grow"><i style={{ width: `${(r.a / max) * 100}%` }} /></div>
                  <span className="num small" style={{ width: 84, textAlign: "right" }}>{r.f(r.a)}</span>
                </div>
                <div className="row" style={{ gap: 10, marginTop: 4 }}>
                  <span className="tiny" style={{ width: 64, fontWeight: 650 }}>{t("Kalau")}</span>
                  <div className="track accent grow"><i style={{ width: `${(r.z / max) * 100}%` }} /></div>
                  <span className="num small" style={{ width: 84, textAlign: "right", fontWeight: 650 }}>{r.f(r.z)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="small muted stack" style={{ gap: 6 }}>
          <span>{t("Untung di sini belum dikurangi biaya lain (gas, sewa, gaji), karena biaya itu tidak berubah oleh harga satu menu.")}</span>
          {priceChanged && <span>{t("Efek harga memakai perkiraan kasar: kalau harga naik 10%, porsi turun sekitar {p}.", { p: pct(1 - Math.pow(1.1, res.elasticity)) })}</span>}
          <span>{t("Hitungan ini menganggap menu lain tidak ikut berubah. Pembeli yang batal beli mungkin pindah ke menu lain.")}</span>
          {res.promo_note && <span>{t("Efek promo belum bisa dihitung: model belum tersedia atau data menu ini kurang dari 7 hari.")}</span>}
        </div>
      </div>
    </section>
  );
}
