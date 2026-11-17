import { useEffect, useMemo, useState } from "react";
import { api, type Dashboard, type SalesDay } from "../api";
import { CATEGORY_LABEL, addDays, dayLong, dayWithName, num, rupiah } from "../format";
import { ErrorBox, Loading, PageHead, toast, useApi } from "../ui";

type Entry = SalesDay["entries"][number];

export default function Catat({ today, initialDay }: { today: string; initialDay: string | null }) {
  const [day, setDay] = useState(initialDay && initialDay <= today ? initialDay : today);
  const sales = useApi<SalesDay>(`/sales?day=${day}`, [day]);
  const week = useApi<Dashboard>("/dashboard?days=7");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [closed, setClosed] = useState(false);
  const [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sales.data) {
      setEntries(sales.data.entries);
      setClosed(sales.data.closed);
      setNote(sales.data.note);
      setDirty(false);
    }
  }, [sales.data]);

  const total = useMemo(() => entries.reduce((a, e) => a + e.qty * e.price, 0), [entries]);
  const portions = entries.reduce((a, e) => a + e.qty, 0);
  const missing = (week.data?.series ?? []).filter((x) => !x.recorded && !x.closed && x.date !== day);

  const set = (id: number, patch: Partial<Entry>) => {
    setEntries((es) => es.map((e) => (e.item_id === id ? { ...e, ...patch } : e)));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put<SalesDay>(`/sales/${day}`, {
        closed, note, entries: entries.map(({ item_id, qty, stockout, promo }) => ({ item_id, qty, stockout, promo })),
      });
      sales.setData(res);
      week.reload();
      toast(closed ? "Hari tutup disimpan" : `Tersimpan: ${num(portions)} porsi, ${rupiah(total)}`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const go = (d: string) => {
    if (dirty && !confirm("Perubahan belum disimpan. Pindah hari?")) return;
    setDay(d);
  };

  const groups = useMemo(() => {
    const g = new Map<string, Entry[]>();
    for (const e of entries) g.set(e.category, [...(g.get(e.category) ?? []), e]);
    return [...g.entries()];
  }, [entries]);

  return (
    <>
      <PageHead title="Catat penjualan" sub="Isi jumlah porsi yang terjual hari itu. Stok bahan ikut berkurang otomatis sesuai resep.">
        <div className="row">
          <button className="btn small" onClick={() => go(addDays(day, -1))} aria-label="Hari sebelumnya">‹</button>
          <input className="input" type="date" value={day} max={today} aria-label="Tanggal"
                 onChange={(e) => e.target.value && go(e.target.value)} style={{ width: 160, minHeight: 36 }} />
          <button className="btn small" onClick={() => go(addDays(day, 1))} disabled={day >= today} aria-label="Hari berikutnya">›</button>
        </div>
      </PageHead>

      {missing.length > 0 && (
        <div className="alert info" style={{ marginBottom: 14 }}>
          <div className="grow">
            Belum dicatat:{" "}
            <span className="chips" style={{ display: "inline-flex", marginTop: 6 }}>
              {missing.map((m) => <button key={m.date} className="chip" onClick={() => go(m.date)}>{dayWithName(m.date)}</button>)}
            </span>
          </div>
        </div>
      )}

      {sales.error && <ErrorBox message={sales.error} retry={sales.reload} />}
      {!sales.data ? <Loading /> : (
        <div className="card">
          <div className="card-head">
            <div>
              <h2>{dayLong(day)}</h2>
              <p className="small muted">{sales.data.recorded ? "Sudah pernah dicatat, bisa diubah" : "Belum dicatat"}</p>
            </div>
            <label className="check"><input type="checkbox" checked={closed} onChange={(e) => { setClosed(e.target.checked); setDirty(true); }} />
              Tutup hari ini</label>
          </div>
          <div className="card-body">
            {closed ? (
              <div className="field">
                <label htmlFor="note">Keterangan (opsional)</label>
                <input id="note" className="input" value={note} placeholder="Contoh: libur Lebaran, sakit"
                       onChange={(e) => { setNote(e.target.value); setDirty(true); }} />
                <span className="hint">Hari tutup tidak dihitung sebagai hari sepi, dan prediksi tahu tokonya tutup.</span>
              </div>
            ) : entries.length === 0 ? (
              <div className="empty">Belum ada menu. <a href="#/menu">Tambahkan menu dulu</a>.</div>
            ) : (
              <div className="stack" style={{ gap: 18 }}>
                {groups.map(([cat, es]) => (
                  <section key={cat}>
                    <h3 className="muted" style={{ marginBottom: 4 }}>{CATEGORY_LABEL[cat as Entry["category"]]}</h3>
                    {es.map((e) => (
                      <div key={e.item_id} className="row wrap" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                        <div className="grow" style={{ minWidth: 150 }}>
                          <div style={{ fontWeight: 600 }}>{e.name}</div>
                          <div className="small muted num">{rupiah(e.price)}{e.qty > 0 && ` · subtotal ${rupiah(e.qty * e.price)}`}</div>
                          <div className="row" style={{ gap: 14 }}>
                            <label className="check small" title="Menu ini habis sebelum warung tutup"><input type="checkbox" checked={e.stockout} onChange={(x) => set(e.item_id, { stockout: x.target.checked })} />Habis duluan</label>
                            <label className="check small"><input type="checkbox" checked={e.promo} onChange={(x) => set(e.item_id, { promo: x.target.checked })} />Promo</label>
                          </div>
                        </div>
                        <div className="stepper" role="group" aria-label={`Jumlah ${e.name}`}>
                          <button type="button" onClick={() => set(e.item_id, { qty: Math.max(0, e.qty - 1) })} aria-label="Kurangi">−</button>
                          <input type="number" inputMode="numeric" min={0} value={e.qty} aria-label={`Jumlah ${e.name}`}
                                 onFocus={(x) => x.target.select()}
                                 onChange={(x) => set(e.item_id, { qty: Math.max(0, parseInt(x.target.value || "0", 10) || 0) })} />
                          <button type="button" onClick={() => set(e.item_id, { qty: e.qty + 1 })} aria-label="Tambah">+</button>
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </div>
          <div className="sticky-save">
            <div className="grow">
              {closed ? <span className="muted">Toko tutup</span> : <>
                <div style={{ fontWeight: 700 }} className="num">{rupiah(total)}</div>
                <div className="small muted num">{num(portions)} porsi</div>
              </>}
            </div>
            <button className="btn primary" onClick={save} disabled={saving || (!dirty && sales.data.recorded)}>
              {saving ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
