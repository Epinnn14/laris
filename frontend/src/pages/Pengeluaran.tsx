import { useState } from "react";
import { api, type Expense } from "../api";
import { t, useLang } from "../i18n";
import { addDays, dayWithName, EXPENSE_CATS, expenseLabel, rupiah, rupiahShort } from "../format";
import { RupiahField } from "../profile";
import { ErrorBox, Loading, PageHead, Segmented, toast, useApi } from "../ui";

export default function Pengeluaran({ today }: { today: string }) {
  useLang();
  const [days, setDays] = useState(30);
  const start = addDays(today, -(days - 1));
  const list = useApi<Expense[]>(`/expenses?start=${start}&end=${today}`, [start]);
  const [cat, setCat] = useState<string>("gas");
  const [amt, setAmt] = useState(0);
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      await api.post("/expenses", { day, category: cat, amount: amt, note });
      toast(t("{c} {rp} dicatat", { c: expenseLabel(cat), rp: rupiah(amt) }));
      setAmt(0);
      setNote("");
      list.reload();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async (e: Expense) => {
    if (!confirm(t("Hapus {c} {rp} tanggal {d}?", { c: expenseLabel(e.category), rp: rupiah(e.amount), d: dayWithName(e.day) }))) return;
    await api.del(`/expenses/${e.id}`);
    list.reload();
  };

  const rows = list.data ?? [];
  const total = rows.reduce((a, e) => a + e.amount, 0);
  const byCat = EXPENSE_CATS.map((c) => ({ c, v: rows.filter((e) => e.category === c).reduce((a, e) => a + e.amount, 0) }))
    .filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...byCat.map((x) => x.v));

  return (
    <>
      <PageHead title={t("Pengeluaran")}
                sub={t("Biaya menjalankan usaha selain bahan: gas, listrik, sewa, gaji. Bahan dicatat di Stok, jadi tidak dihitung dua kali.")} />
      <div className="grid two">
        <section className="card" aria-labelledby="add-h">
          <div className="card-head"><h2 id="add-h">{t("Catat pengeluaran")}</h2></div>
          <div className="card-body stack" style={{ gap: 14 }}>
            <div className="field">
              <span className="label" id="cat-l">{t("Untuk apa?")}</span>
              <div className="chips" role="group" aria-labelledby="cat-l">
                {EXPENSE_CATS.map((c) => <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{expenseLabel(c)}</button>)}
              </div>
            </div>
            <RupiahField id="amt" label={t("Jumlah")} value={amt} onChange={setAmt} />
            <div className="grid halves" style={{ gap: 10 }}>
              <div className="field"><label htmlFor="ed">{t("Tanggal")}</label>
                <input id="ed" className="input" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} /></div>
              <div className="field"><label htmlFor="en">{t("Catatan")} <span className="muted">({t("boleh dikosongkan")})</span></label>
                <input id="en" className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></div>
            </div>
            <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={add} disabled={busy || amt <= 0 || !day}>
              {busy ? t("Menyimpan…") : t("Simpan pengeluaran")}
            </button>
          </div>
        </section>

        <section className="card" aria-labelledby="sum-h">
          <div className="card-head">
            <div>
              <h2 id="sum-h">{t("Uang keluar untuk apa saja?")}</h2>
              <p className="small muted">{t("{n} hari terakhir", { n: days })}</p>
            </div>
            <Segmented label={t("Periode")} value={days} onChange={setDays}
                       options={[{ value: 30, label: t("30 hari") }, { value: 90, label: t("90 hari") }]} />
          </div>
          <div className="card-body">
            {list.error ? <ErrorBox message={list.error} retry={list.reload} /> : !list.data ? <Loading /> : byCat.length === 0 ? (
              <p className="muted">{t("Belum ada pengeluaran di periode ini. Catat yang rutin dulu: gas, listrik, sewa, gaji.")}</p>
            ) : (
              <>
                <div className="fig total" style={{ fontSize: 28, display: "inline-block" }}>{rupiah(total)}</div>
                <div className="hbars" style={{ marginTop: 16 }}>
                  {byCat.map((x) => (
                    <div key={x.c}>
                      <div className="hbar-top"><span className="grow">{expenseLabel(x.c)}</span><span className="num">{rupiahShort(x.v)}</span></div>
                      <div className="track"><i style={{ width: `${(x.v / max) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }} aria-labelledby="list-h">
        <div className="card-head"><h2 id="list-h">{t("Catatan pengeluaran")}</h2></div>
        <div className="card-body table-wrap">
          {!list.data ? <Loading /> : rows.length === 0 ? <div className="empty">{t("Belum ada catatan.")}</div> : (
            <table>
              <thead><tr><th>{t("Tanggal")}</th><th>{t("Untuk")}</th><th className="num">{t("Jumlah")}</th><th /></tr></thead>
              <tbody>{(all ? rows : rows.slice(0, 15)).map((e) => (
                <tr key={e.id}>
                  <td>{dayWithName(e.day)}</td>
                  <td>{expenseLabel(e.category)}{e.note && <div className="small muted">{e.note}</div>}</td>
                  <td className="num">{rupiah(e.amount)}</td>
                  <td className="right"><button className="btn small ghost" onClick={() => remove(e)}>{t("Hapus")}</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {rows.length > 15 && (
            <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => setAll(!all)} aria-expanded={all}>
              {all ? t("Tampilkan lebih sedikit") : t("Tampilkan semua ({n})", { n: rows.length })}
            </button>
          )}
        </div>
      </section>
    </>
  );
}
