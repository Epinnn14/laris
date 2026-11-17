import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type Forecast, type MenuItem } from "../api";
import { addDays, catLabel, dayShort, dayWithName, num, pct, rupiah, rupiahShort, weekdayName } from "../format";
import { t, useLang } from "../i18n";
import { ErrorBox, Loading, PageHead, Segmented, toast, useApi } from "../ui";

export default function Prediksi() {
  useLang();
  const fc = useApi<Forecast>("/forecast");
  const [metric, setMetric] = useState<"revenue" | "portions">("revenue");
  const [open, setOpen] = useState<number | null>(null);

  if (fc.error) return <ErrorBox message={fc.error} retry={fc.reload} />;
  if (!fc.data) return <Loading label={t("Menghitung prediksi…")} />;
  const f = fc.data;
  if (!f.items.length) return <><PageHead title={t("Prediksi")} /><div className="card pad empty">{t("Tambahkan menu dan catat penjualan dulu. Prediksi muncul setelah sekitar 7 hari tercatat.")}</div></>;

  const fmt = metric === "revenue" ? rupiahShort : (v: number) => num(v);
  const data = f.dates.map((date, i) => {
    const t = f.totals[metric][i];
    return { date, lo: t[0], mid: t[1], hi: t[2], band: [t[0], t[2]], closed: f.closed[i] };
  });
  const week = data.slice(0, 7).reduce((a, x) => a + x.mid, 0);
  const month = data.reduce((a, x) => a + x.mid, 0);

  return (
    <>
      <PageHead title={t("Prediksi 4 minggu")} sub={<>
        {f.method === "larisnet" ? t("Dari model LarisNet: pola hari, gajian, Ramadan dan Lebaran, libur, promo, dan hari tutup.") : t(f.note)}
        {f.method === "larisnet" && f.note && <> {t(f.note)}</>}
      </>}>
        <Segmented label={t("Tampilkan")} value={metric} onChange={setMetric}
                   options={[{ value: "revenue", label: t("Omzet") }, { value: "portions", label: t("Porsi") }]} />
      </PageHead>

      {f.backtest && (
        <div className="alert info" style={{ marginBottom: 16 }}>
          <div>{t("Seberapa tepat? Prediksi yang dibuat {d} hari lalu meleset rata-rata ± {n} porsi per menu per hari (tepat {p} dihitung dari total porsi).", {
            d: f.backtest.days, n: f.backtest.mae.toLocaleString(undefined, { maximumFractionDigits: 1 }), p: pct(f.backtest.accuracy) })}</div>
        </div>
      )}

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="label">{t("7 hari ke depan")}</div><div className="value">{fmt(week)}</div>
          <div className="sub muted">{metric === "revenue" ? t("perkiraan omzet") : t("perkiraan porsi")}</div></div>
        <div className="card kpi"><div className="label">{t("28 hari ke depan")}</div><div className="value">{fmt(month)}</div>
          <div className="sub muted">{t("nilai tengah, bisa lebih atau kurang")}</div></div>
        <div className="card kpi"><div className="label">{t("Besok")}</div><div className="value">{fmt(data[1]?.mid ?? 0)}</div>
          <div className="sub muted">{data[1] && (data[1].closed ? t("tutup") : `${fmt(data[1].lo)} – ${fmt(data[1].hi)}`)}</div></div>
        <div className="card kpi"><div className="label">{t("Hari tutup terencana")}</div><div className="value">{f.closed.filter(Boolean).length}</div>
          <div className="sub muted">{f.weekly_off.length
            ? t("termasuk libur rutin {days}", { days: f.weekly_off.map(weekdayName).join(", ") })
            : t("dalam 28 hari")}</div></div>
      </div>

      <div className="card">
        <div className="card-head"><div><h2>{metric === "revenue" ? t("Kira-kira omzet tiap hari?") : t("Kira-kira berapa porsi tiap hari?")}</h2>
          <p className="muted small">{t("Garis = perkiraan tengah. Area = kemungkinan besar (8 dari 10 hari jatuh di sini). Kotak abu-abu = tutup.")}</p></div></div>
        <div className="card-body" style={{ height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--rule)" />
              <XAxis dataKey="date" tickFormatter={dayShort} tickLine={false} axisLine={false} minTickGap={20} />
              <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} width={64} />
              {data.filter((x) => x.closed).map((x) => (
                <ReferenceArea key={x.date} x1={x.date} x2={x.date} fill="var(--hover)" strokeOpacity={0} />
              ))}
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                return <div className="tip"><strong>{dayWithName(p.date)}</strong><br />
                  {p.closed ? t("Tutup") : <>{t("Sekitar {rp}", { rp: metric === "revenue" ? rupiah(p.mid) : t("{n} porsi", { n: num(p.mid) }) })}<br />
                    <span className="muted">{fmt(p.lo)} – {fmt(p.hi)}</span></>}</div>;
              }} />
              <Area dataKey="band" stroke="none" fill="var(--chart-band)" fillOpacity={0.7} isAnimationActive={false} />
              <Line dataKey="mid" stroke="var(--accent)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><div><h2>{t("Per menu")}</h2><p className="muted small">{t("Ketuk menu untuk melihat grafik 4 minggunya")}</p></div></div>
        <div className="card-body table-wrap">
          <table>
            <thead><tr><th>{t("Menu")}</th><th className="num">{t("Hari ini")}</th><th className="num">{t("Besok")}</th><th className="num">{t("7 hari")}</th><th className="num">{t("Kisaran 7 hari")}</th></tr></thead>
            <tbody>
              {f.items.map((it) => (
                <ItemRow key={it.id} it={it} dates={f.dates} closed={f.closed} open={open === it.id} toggle={() => setOpen(open === it.id ? null : it.id)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Plans start={f.start} onChange={fc.reload} />
    </>
  );
}

function ItemRow({ it, dates, closed, open, toggle }: {
  it: Forecast["items"][number]; dates: string[]; closed: boolean[]; open: boolean; toggle: () => void;
}) {
  const data = dates.map((date, i) => ({ date, mid: it.p50[i], band: [it.p10[i], it.p90[i]], closed: closed[i] }));
  return (
    <>
      <tr onClick={toggle} style={{ cursor: "pointer" }} aria-expanded={open}>
        <td><button className="btn ghost small" style={{ padding: 0, minHeight: 0, fontWeight: 600 }} onClick={(e) => { e.stopPropagation(); toggle(); }}>
          {open ? "▾" : "▸"} {it.name}</button>
          <div className="small muted">{catLabel(it.category)}{it.history_days < 14 && ` · ${t("data baru {n} hari", { n: it.history_days })}`}</div></td>
        <td className="num">{num(it.p50[0])}</td>
        <td className="num">{num(it.p50[1])}</td>
        <td className="num"><strong>{num(it.week[1])}</strong></td>
        <td className="num muted">{num(it.week[0])} – {num(it.week[2])}</td>
      </tr>
      {open && (
        <tr><td colSpan={5}>
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" tickFormatter={dayShort} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={36} />
                <Tooltip formatter={(v) => (Array.isArray(v) ? `${num(Number(v[0]))} – ${num(Number(v[1]))}` : num(Number(v)))}
                         labelFormatter={(l) => dayWithName(String(l))} />
                <Area dataKey="band" name={t("Kisaran")} stroke="none" fill="var(--chart-band)" fillOpacity={0.7} isAnimationActive={false} />
                <Line dataKey="mid" name={t("Perkiraan")} stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </td></tr>
      )}
    </>
  );
}

function Plans({ start, onChange }: { start: string; onChange: () => void }) {
  const end = addDays(start, 60);
  const days = useApi<{ day: string; note: string }[]>(`/days?start=${start}&end=${end}`);
  const promos = useApi<{ id: number; item_id: number; start: string; end: string; note: string }[]>("/promos");
  const menu = useApi<MenuItem[]>("/menu");
  const [cDay, setCDay] = useState(addDays(start, 1));
  const [cNote, setCNote] = useState("");
  const [pItem, setPItem] = useState<number | "">("");
  const [pStart, setPStart] = useState(start);
  const [pEnd, setPEnd] = useState(addDays(start, 2));

  const after = () => { days.reload(); promos.reload(); onChange(); };
  const addClosure = async () => { await api.put(`/days/${cDay}`, { closed: true, note: cNote }); setCNote(""); toast(t("Hari tutup ditambahkan")); after(); };
  const removeClosure = async (d: string) => { await api.put(`/days/${d}`, { closed: false }); after(); };
  const addPromo = async () => {
    if (!pItem) return;
    try { await api.post("/promos", { item_id: pItem, start: pStart, end: pEnd }); toast(t("Promo ditambahkan")); after(); }
    catch (e) { toast((e as Error).message); }
  };
  const names = new Map((menu.data ?? []).map((m) => [m.id, m.name]));

  return (
    <div className="grid halves" style={{ marginTop: 16 }}>
      <div className="card">
        <div className="card-head"><div><h2>{t("Rencana tutup")}</h2><p className="small muted">{t("Mudik, libur, acara: prediksi dan belanja ikut menyesuaikan")}</p></div></div>
        <div className="card-body stack">
          <div className="row wrap">
            <input className="input" type="date" value={cDay} min={start} onChange={(e) => setCDay(e.target.value)} style={{ width: 170 }} aria-label={t("Tanggal tutup")} />
            <input className="input grow" value={cNote} onChange={(e) => setCNote(e.target.value)} placeholder={t("Keterangan")} aria-label={t("Keterangan")} style={{ minWidth: 140 }} />
            <button className="btn" onClick={addClosure}>{t("Tambah")}</button>
          </div>
          {(days.data ?? []).length === 0 ? <div className="small muted">{t("Belum ada rencana tutup.")}</div> :
            (days.data ?? []).map((d) => (
              <div key={d.day} className="row"><span className="grow">{dayWithName(d.day)} <span className="muted small">{d.note}</span></span>
                <button className="btn small ghost" onClick={() => removeClosure(d.day)}>{t("Hapus")}</button></div>
            ))}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div><h2>{t("Rencana promo")}</h2><p className="small muted">{t("Menu yang dipromokan biasanya laku lebih banyak")}</p></div></div>
        <div className="card-body stack">
          <select className="input" value={pItem} onChange={(e) => setPItem(e.target.value ? Number(e.target.value) : "")} aria-label={t("Menu promo")}>
            <option value="">{t("Pilih menu…")}</option>
            {(menu.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <div className="row wrap">
            <input className="input" type="date" value={pStart} min={start} onChange={(e) => setPStart(e.target.value)} style={{ width: 160 }} aria-label={t("Mulai")} />
            <span className="muted">{t("s.d.")}</span>
            <input className="input" type="date" value={pEnd} min={pStart} onChange={(e) => setPEnd(e.target.value)} style={{ width: 160 }} aria-label={t("Selesai")} />
            <button className="btn" onClick={addPromo} disabled={!pItem}>{t("Tambah")}</button>
          </div>
          {(promos.data ?? []).map((p) => (
            <div key={p.id} className="row"><span className="grow">{names.get(p.item_id) ?? "?"} <span className="muted small">{dayShort(p.start)} – {dayShort(p.end)}</span></span>
              <button className="btn small ghost" onClick={async () => { await api.del(`/promos/${p.id}`); after(); }}>{t("Hapus")}</button></div>
          ))}
        </div>
      </div>
    </div>
  );
}
