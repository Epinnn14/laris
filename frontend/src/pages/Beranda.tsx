// The owner opens this to answer: "Am I making money, and what should I do today?"
// So the money statement and the to-do list come first; charts follow, each titled with its question.
import { useState } from "react";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AppState, Dashboard, Forecast, Plan, Target } from "../api";
import { t, useLang } from "../i18n";
import { addDays, catLabel, change, dayShort, dayWithName, expenseLabel, monthName, num, pct, rupiah, rupiahShort, weekdayAbbr, weekdayShort } from "../format";
import { ErrorBox, Loading, PageHead, Segmented, useApi } from "../ui";

const LEVEL = {
  ramai: { color: "var(--gain)", label: "Lebih ramai dari biasanya" },
  normal: { color: "var(--chart-ink)", label: "Seperti biasa" },
  sepi: { color: "var(--loss)", label: "Lebih sepi dari biasanya" },
} as const;

function greeting(): string {
  const h = new Date().getHours();
  return h < 11 ? t("Selamat pagi") : h < 15 ? t("Selamat siang") : h < 18 ? t("Selamat sore") : t("Selamat malam");
}

export default function Beranda({ state }: { state: AppState }) {
  useLang();
  const [days, setDays] = useState(30);
  const dash = useApi<Dashboard>(`/dashboard?days=${days}`, [days]);
  const fc = useApi<Forecast>("/forecast");
  const plan = useApi<Plan>("/plan");

  const head = (
    <PageHead title={`${greeting()}, ${state.owner_name || state.shop_name}`}
              sub={dash.data ? t("Buku kas {start} – {end}: {n} hari buka", {
                start: dayShort(dash.data.period.start), end: dayShort(dash.data.period.end), n: dash.data.kpi.open_days }) : undefined}>
      <Segmented label={t("Periode")} value={days} onChange={setDays}
                 options={[{ value: 7, label: t("7 hari") }, { value: 30, label: t("30 hari") }, { value: 90, label: t("90 hari") }]} />
    </PageHead>
  );
  if (dash.error) return <>{head}<ErrorBox message={dash.error} retry={dash.reload} /></>;
  if (!dash.data) return <>{head}<Loading /></>;
  const d = dash.data;

  if (d.kpi.portions === 0) return (
    <>
      {head}
      <div className="grid two">
        <div className="card pad">
          <h2>{t("Belum ada penjualan tercatat di periode ini")}</h2>
          <p className="muted" style={{ marginTop: 8 }}>{t("Buku kas terisi dari catatan harian. Mulai dengan dua langkah ini:")}</p>
          <ol className="todo" style={{ marginTop: 8 }}>
            <li><span className="n">1</span><span className="grow">{t("Pastikan menu dan resep sudah benar")}</span><a className="btn small" href="#/menu">{t("Buka menu")}</a></li>
            <li><span className="n">2</span><span className="grow">{t("Catat porsi yang terjual hari ini")}</span><a className="btn small primary" href="#/catat">{t("Catat penjualan")}</a></li>
          </ol>
          <p className="small muted" style={{ marginTop: 10 }}>{t("Prediksi dan daftar belanja muncul setelah sekitar 7 hari tercatat.")}</p>
        </div>
        <TargetCard target={d.target} />
      </div>
    </>
  );

  return (
    <>
      {head}
      <div className="stack" style={{ gap: 16 }}>
        <div className="grid two" style={{ alignItems: "start" }}>
          <MoneyStatement d={d} days={days} />
          <div className="stack" style={{ gap: 16 }}>
            <ToDo d={d} plan={plan.data} today={state.today} />
            <TargetCard target={d.target} />
          </div>
        </div>
        <DailyChart d={d} />
        <div className="grid two" style={{ alignItems: "start" }}>
          <MenuEarnings d={d} />
          <div className="stack" style={{ gap: 16 }}>
            <Weekdays d={d} />
            <NextWeek fc={fc.data} error={fc.error} />
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- money statement (focal point)

function MoneyStatement({ d, days }: { d: Dashboard; days: number }) {
  const k = d.kpi;
  const net = k.net_profit;
  const loss = net < 0;
  const per100 = (v: number) => (k.revenue > 0 ? (v / k.revenue) * 100_000 : 0);
  const parts = [
    { key: "bahan", label: t("Bahan"), value: k.ingredient_cost, color: "var(--chart-ink)" },
    { key: "buang", label: t("Terbuang"), value: k.waste_cost, color: "var(--warn)" },
    { key: "biaya", label: t("Biaya lain"), value: k.expenses, color: "var(--chart-faint)" },
    { key: "untung", label: t("Untung"), value: Math.max(net, 0), color: "var(--accent)" },
  ];
  const ch = change(k.net_change, days === 7 ? "7 hari sebelumnya" : days === 30 ? "30 hari sebelumnya" : "90 hari sebelumnya");
  return (
    <section className="card" aria-labelledby="money-h">
      <div className="card-head">
        <div>
          <h2 id="money-h">{t("Berapa yang benar-benar jadi untung?")}</h2>
          <p className="small muted">{t("Dihitung dari penjualan yang dicatat, resep, stok, dan pengeluaran.")}</p>
        </div>
      </div>
      <div className="card-body">
        <table className="ledger">
          <tbody>
            <tr><td className="sign" /><td>{t("Uang masuk dari penjualan")}<span className="note">{t("{n} porsi", { n: num(k.portions) })}</span></td>
              <td>{rupiah(k.revenue)}</td></tr>
            <tr><td className="sign">−</td><td>{t("Modal bahan untuk porsi yang terjual")}<span className="note">{t("dari resep tiap menu")}</span></td>
              <td>{rupiah(k.ingredient_cost)}</td></tr>
            <tr><td className="sign">−</td><td>{t("Bahan terbuang")}<span className="note">{k.waste_cost > 0 ? t("basi atau rusak, dicatat di Stok") : t("tidak ada yang dicatat")}</span></td>
              <td>{rupiah(k.waste_cost)}</td></tr>
            <tr><td className="sign">−</td><td>
              {t("Biaya lain")}
              {d.expenses.length > 0
                ? <span className="note">{d.expenses.slice(0, 3).map((e) => expenseLabel(e.category)).join(", ")}{d.expenses.length > 3 ? ", …" : ""} · <a href="#/pengeluaran">{t("lihat")}</a></span>
                : <span className="note">{t("belum dicatat")} · <a href="#/pengeluaran">{t("catat gas, listrik, sewa")}</a></span>}
            </td><td>{rupiah(k.expenses)}</td></tr>
            <tr className="result">
              <td className="sign">=</td>
              <td><strong>{loss ? t("Rugi bersih") : t("Untung bersih")}</strong><span className={`note ${ch.cls}`}>{ch.text}</span></td>
              <td><span className="fig total" style={{ color: loss ? "var(--loss)" : "var(--accent)" }}>{rupiah(net)}</span></td>
            </tr>
          </tbody>
        </table>
        {k.revenue > 0 && (
          <div style={{ marginTop: 18 }}>
            <div className="small" style={{ marginBottom: 6 }}>{t("Dari setiap {rp} yang masuk:", { rp: rupiah(100_000) })}</div>
            <div className="split" role="img" aria-label={parts.map((p) => `${p.label} ${rupiah(per100(p.value))}`).join(", ")}>
              {parts.filter((p) => p.value > 0).map((p) => <i key={p.key} style={{ width: `${(p.value / k.revenue) * 100}%`, background: p.color }} />)}
            </div>
            <div className="keys">
              {parts.map((p) => (
                <span key={p.key}><i style={{ background: p.color }} />{p.label} <strong className="num">{rupiahShort(per100(p.value))}</strong></span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- what to do today

function ToDo({ d, plan, today }: { d: Dashboard; plan: Plan | null; today: string }) {
  const items: { urgent: boolean; text: string; href: string; action: string }[] = [];
  const missing = d.series.filter((x) => !x.recorded && !x.closed && x.date >= addDays(today, -7));
  if (missing.length) {
    const last = missing[missing.length - 1].date;
    items.push({ urgent: true, href: `#/catat?hari=${last}`, action: t("Catat"),
                 text: missing.length === 1 ? t("Penjualan {day} belum dicatat", { day: dayWithName(last) })
                                            : t("{n} hari belum dicatat minggu ini", { n: missing.length }) });
  }
  const soon = (plan?.items ?? []).filter((x) => x.buy > 0 && x.days_left !== null && x.days_left < 1);
  if (soon.length) items.push({ urgent: true, href: "#/belanja", action: t("Belanja"),
    text: t("{n} bahan habis sebelum besok: {names}", { n: soon.length, names: soon.slice(0, 3).map((x) => x.name).join(", ") + (soon.length > 3 ? ", …" : "") }) });
  const so = d.items.filter((x) => x.stockouts >= 2).sort((a, b) => b.stockouts - a.stockouts);
  if (so.length) items.push({ urgent: false, href: "#/prediksi", action: t("Lihat"),
    text: t("{name} habis duluan {n}× bulan ini. Siapkan lebih banyak.", { name: so[0].name, n: so[0].stockouts }) });
  if (d.kpi.expenses === 0) items.push({ urgent: false, href: "#/pengeluaran", action: t("Catat"),
    text: t("Belum ada biaya lain tercatat, jadi untung bersih terlihat lebih besar dari kenyataan.") });
  const thin = d.items.filter((x) => x.margin !== null && x.margin < 0.4);
  if (thin.length) items.push({ urgent: false, href: "#/menu", action: t("Cek harga"),
    text: t("{n} menu untungnya tipis (di bawah 40%): {names}", { n: thin.length, names: thin.slice(0, 2).map((x) => x.name).join(", ") + (thin.length > 2 ? ", …" : "") }) });

  return (
    <section className="card" aria-labelledby="todo-h">
      <div className="card-head"><h2 id="todo-h">{t("Yang perlu dilakukan")}</h2></div>
      <div className="card-body" style={{ paddingTop: 6 }}>
        {plan === null && <div className="small muted">{t("Mengecek stok bahan…")}</div>}
        {items.length === 0 && plan !== null ? <p className="muted">{t("Semua beres. Tidak ada yang mendesak hari ini.")}</p> : (
          <ol className="todo">
            {items.slice(0, 4).map((x, i) => (
              <li key={x.text} className={x.urgent ? "urgent" : ""}>
                <span className="n">{i + 1}</span>
                <span className="grow">{x.text}</span>
                <a className={`btn small ${x.urgent && i === 0 ? "primary" : ""}`} href={x.href}>{x.action}</a>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- monthly target

function chanceWords(c: number): string {
  return c >= 0.7 ? t("besar") : c >= 0.3 ? t("setengah-setengah") : t("kecil");
}

export function TargetCard({ target }: { target: Target | null }) {
  if (!target) return (
    <section className="card pad" aria-labelledby="tg-h">
      <h2 id="tg-h">{t("Target bulan ini")}</h2>
      <p className="muted" style={{ margin: "6px 0 12px" }}>{t("Pasang target omzet per bulan untuk melihat apakah bulan ini kemungkinan tercapai.")}</p>
      <a className="btn small" href="#/pengaturan">{t("Pasang target")}</a>
    </section>
  );
  const max = Math.max(target.goal, target.projected?.[2] ?? 0, target.done) * 1.05;
  const x = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const reached = target.done >= target.goal;
  return (
    <section className="card" aria-labelledby="tg-h">
      <div className="card-head">
        <div>
          <h2 id="tg-h">{t("Target {month}", { month: monthName(target.month) })}</h2>
          <p className="small muted">{t("Target omzet {rp}", { rp: rupiah(target.goal) })}</p>
        </div>
      </div>
      <div className="card-body">
        <div className="meter" role="img" aria-label={t("Sudah {done} dari target {goal}", { done: rupiah(target.done), goal: rupiah(target.goal) })}>
          <div className="done" style={{ width: x(target.done) }} />
          {target.projected && <div className="likely" style={{ left: x(target.projected[0]), width: `calc(${x(target.projected[2])} - ${x(target.projected[0])})` }} />}
          <div className="goal" style={{ left: x(target.goal) }} />
        </div>
        <div className="legend" style={{ marginTop: 10 }}>
          <span><i style={{ background: "var(--accent)" }} />{t("Sudah masuk")}</span>
          {target.projected && <span><i style={{ background: "var(--chart-band)", border: "1px solid var(--accent)" }} />{t("Perkiraan akhir bulan")}</span>}
          <span><i className="line" style={{ background: "var(--ink)", width: 2, height: 12, verticalAlign: -1 }} />{t("Target")}</span>
        </div>
        <table className="ledger" style={{ marginTop: 10, fontSize: 15 }}>
          <tbody>
            <tr><td>{t("Sudah masuk")}</td><td>{rupiah(target.done)} <span className="muted small">({pct(target.done / target.goal)})</span></td></tr>
            {target.projected && <tr><td>{t("Perkiraan akhir bulan")}</td><td>{rupiahShort(target.projected[0])} – {rupiahShort(target.projected[2])}</td></tr>}
            {!reached && <tr><td>{t("Perlu per hari buka")}<span className="note">{t("{n} hari buka tersisa", { n: target.open_days_left })}</span></td>
              <td>{rupiah(target.per_day_needed)}</td></tr>}
          </tbody>
        </table>
        <p style={{ marginTop: 10 }}>
          {reached ? <strong className="up">{t("Target sudah tercapai bulan ini.")}</strong>
            : target.chance !== null ? <>{t("Kemungkinan tercapai:")} <strong>{chanceWords(target.chance)}</strong> <span className="muted small">({t("{n} dari 100 kemungkinan", { n: Math.round(target.chance * 100) })})</span></>
            : <span className="muted">{t("Perkiraan muncul setelah ada cukup data.")}</span>}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- daily revenue vs usual

function DailyChart({ d }: { d: Dashboard }) {
  const data = d.series.map((p) => ({ ...p, usualLine: p.closed ? null : p.usual || null }));
  const best = d.kpi.best_day;
  const quiet = d.kpi.quiet_day;
  return (
    <section className="card" aria-labelledby="daily-h">
      <div className="card-head">
        <div>
          <h2 id="daily-h">{t("Tiap hari lebih ramai atau lebih sepi dari biasanya?")}</h2>
          <p className="small muted">
            {best && quiet && t("Paling ramai {b} ({br}). Paling sepi {q} ({qr}).", {
              b: dayWithName(best.date), br: rupiahShort(best.revenue), q: dayWithName(quiet.date), qr: rupiahShort(quiet.revenue) })}
          </p>
        </div>
      </div>
      <div className="card-body">
        <div style={{ height: 250 }}>
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--rule)" />
              <XAxis dataKey="date" tickFormatter={dayShort} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickFormatter={rupiahShort} tickLine={false} axisLine={false} width={68} />
              <Tooltip cursor={{ fill: "var(--hover)" }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as Dashboard["series"][number];
                return (
                  <div className="tip">
                    <strong>{dayWithName(p.date)}</strong><br />
                    {p.closed ? t("Tutup") + (p.note && p.note !== "tutup" ? ` (${t(p.note)})` : "")
                      : !p.recorded ? t("Belum dicatat") : <>
                        {rupiah(p.revenue)} · {t("{n} porsi", { n: num(p.portions) })}<br />
                        {p.usual > 0 && <span className="muted">{t("Biasanya hari {d}: {rp}", { d: weekdayShort(p.date), rp: rupiahShort(p.usual) })}</span>}
                      </>}
                  </div>
                );
              }} />
              <Bar dataKey="revenue" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {data.map((p) => <Cell key={p.date} fill={p.level ? LEVEL[p.level].color : "var(--chart-faint)"} />)}
              </Bar>
              <Line dataKey="usualLine" stroke="var(--ink)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="legend" style={{ marginTop: 8 }}>
          {(["ramai", "normal", "sepi"] as const).map((k) => <span key={k}><i style={{ background: LEVEL[k].color }} />{t(LEVEL[k].label)}</span>)}
          <span><i className="line" style={{ borderTop: "2px dashed var(--ink)", background: "none" }} />{t("Biasanya untuk hari itu")}</span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- which menu earns

function MenuEarnings({ d }: { d: Dashboard }) {
  const [all, setAll] = useState(false);
  const items = [...d.items].sort((a, b) => b.profit - a.profit);
  const max = Math.max(1, ...items.map((x) => x.profit));
  const shown = all ? items : items.slice(0, 7);
  return (
    <section className="card" aria-labelledby="menu-h">
      <div className="card-head">
        <div>
          <h2 id="menu-h">{t("Menu mana yang paling menghasilkan untung?")}</h2>
          <p className="small muted">{t("Untung = harga jual dikurangi modal bahan, dikali porsi terjual.")}</p>
        </div>
      </div>
      <div className="card-body">
        <div className="hbars">
          {shown.map((x) => (
            <div key={x.id}>
              <div className="hbar-top">
                <span className="grow">{x.name}</span>
                <span className="num fig" style={{ fontSize: 16 }}>{rupiahShort(x.profit)}</span>
              </div>
              <div className="track"><i style={{ width: `${(Math.max(0, x.profit) / max) * 100}%` }} /></div>
              <div className="row wrap tiny muted" style={{ marginTop: 4, gap: "2px 10px" }}>
                <span>{catLabel(x.category)}</span>
                <span className="num">{t("harga {rp}", { rp: rupiah(x.price) })}</span>
                <span className="num">{t("{n} porsi terjual", { n: num(x.qty) })}</span>
                <span className="num">{t("untung {p} per porsi", { p: pct(x.margin) })}</span>
                {x.change !== null && <span className={`num ${x.change >= 0 ? "up" : "down"}`}>{x.change >= 0 ? "▲" : "▼"} {pct(Math.abs(x.change))}</span>}
                {x.margin !== null && x.margin < 0.4 && <span className="badge warn">{t("untung tipis")}</span>}
                {x.stockouts > 0 && <span className="badge bad">{t("habis duluan {n}×", { n: x.stockouts })}</span>}
              </div>
            </div>
          ))}
        </div>
        {items.length > 7 && (
          <button className="btn small ghost" style={{ marginTop: 12 }} onClick={() => setAll(!all)} aria-expanded={all}>
            {all ? t("Tampilkan lebih sedikit") : t("Tampilkan semua {n} menu", { n: items.length })}
          </button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- weekdays

function Weekdays({ d }: { d: Dashboard }) {
  const open = d.weekday.filter((w) => w.revenue > 0);
  const max = Math.max(1, ...open.map((w) => w.revenue));
  const order = [...d.weekday.keys()];
  return (
    <section className="card" aria-labelledby="wd-h">
      <div className="card-head">
        <div><h2 id="wd-h">{t("Hari apa paling ramai?")}</h2><p className="small muted">{t("Rata-rata omzet per hari, 8 minggu terakhir")}</p></div>
      </div>
      <div className="card-body">
        <div className="hbars" style={{ gap: 8 }}>
          {order.map((i) => {
            const w = d.weekday[i];
            const top = i === d.weekday.findIndex((x) => x.revenue === max);
            return (
              <div key={i} className="row" style={{ gap: 10 }}>
                <span style={{ width: 54 }} className="small">{weekdayAbbr(i)}</span>
                <div className={`track grow ${top ? "accent" : ""}`} style={{ height: 14 }}><i style={{ width: `${(w.revenue / max) * 100}%` }} /></div>
                <span className="num small" style={{ width: 72, textAlign: "right" }}>{w.revenue ? rupiahShort(w.revenue) : t("tutup")}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- next 7 days

function NextWeek({ fc, error }: { fc: Forecast | null; error: string | null }) {
  if (error) return <ErrorBox message={error} />;
  if (!fc) return <div className="card pad"><Loading label={t("Menghitung prediksi…")} /></div>;
  if (!fc.items.length) return <div className="card pad muted">{t("Prediksi muncul setelah ada menu dan penjualan.")}</div>;
  const data = fc.dates.slice(0, 7).map((date, i) => ({
    date, closed: fc.closed[i],
    // closed days break the line instead of dragging it to zero
    mid: fc.closed[i] ? null : fc.totals.revenue[i][1], band: fc.closed[i] ? null : [fc.totals.revenue[i][0], fc.totals.revenue[i][2]],
    lo: fc.totals.revenue[i][0], hi: fc.totals.revenue[i][2],
  }));
  const sum = data.reduce((a, x) => a + (x.mid ?? 0), 0);
  const lo = data.reduce((a, x) => a + x.lo, 0);
  const hi = data.reduce((a, x) => a + x.hi, 0);
  return (
    <section className="card" aria-labelledby="nw-h">
      <div className="card-head">
        <div>
          <h2 id="nw-h">{t("Kira-kira laku berapa 7 hari ke depan?")}</h2>
          <p className="small"><span className="fig" style={{ fontSize: 20 }}>{rupiahShort(sum)}</span>{" "}
            <span className="muted">{t("kemungkinan {lo} – {hi}", { lo: rupiahShort(lo), hi: rupiahShort(hi) })}</span></p>
        </div>
        <a className="small" href="#/prediksi">{t("Detail")}</a>
      </div>
      <div className="card-body" style={{ height: 170 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis dataKey="date" tickFormatter={weekdayShort} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof data)[number];
              return <div className="tip"><strong>{dayWithName(p.date)}</strong><br />
                {p.closed ? t("Tutup") : <>{t("Sekitar {rp}", { rp: rupiah(p.mid ?? 0) })}<br /><span className="muted">{t("kemungkinan {lo} – {hi}", { lo: rupiahShort(p.lo), hi: rupiahShort(p.hi) })}</span></>}</div>;
            }} />
            <Area dataKey="band" stroke="none" fill="var(--chart-band)" fillOpacity={0.8} isAnimationActive={false} />
            <Line dataKey="mid" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--accent)" }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
