import { useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AppState, Dashboard, Forecast, Plan } from "../api";
import { CATEGORY_LABEL, addDays, change, dayShort, dayWithName, num, pct, rupiah, rupiahShort } from "../format";
import { ErrorBox, Loading, PageHead, Segmented, useApi } from "../ui";

const LEVEL_COLOR = { ramai: "var(--chart-1)", normal: "var(--chart-2)", sepi: "var(--chart-3)" } as const;
const LEVEL_LABEL = { ramai: "Ramai", normal: "Biasa", sepi: "Sepi" } as const;

export default function Beranda({ state }: { state: AppState }) {
  const [days, setDays] = useState(30);
  const dash = useApi<Dashboard>(`/dashboard?days=${days}`, [days]);
  const fc = useApi<Forecast>("/forecast");
  const plan = useApi<Plan>("/plan");

  if (dash.error) return <ErrorBox message={dash.error} retry={dash.reload} />;
  if (!dash.data) return <Loading />;
  const d = dash.data;
  const empty = d.kpi.portions === 0;
  const yesterday = addDays(state.today, -1);
  const yRec = d.series.find((x) => x.date === yesterday);
  const urgent = (plan.data?.items ?? []).filter((x) => x.buy > 0 && x.risk >= 0.5);

  return (
    <>
      <PageHead title={`Halo, ${state.shop_name}`} sub={`${dayShort(d.period.start)} – ${dayShort(d.period.end)} · ${d.kpi.open_days} hari buka`}>
        <Segmented label="Periode" value={days} onChange={setDays}
                   options={[{ value: 7, label: "7 hari" }, { value: 30, label: "30 hari" }, { value: 90, label: "90 hari" }]} />
      </PageHead>

      <div className="stack" style={{ marginBottom: 14 }}>
        {yRec && !yRec.recorded && !yRec.closed && (
          <div className="alert info">
            <div className="grow">Penjualan kemarin ({dayWithName(yesterday)}) belum dicatat.</div>
            <a className="btn small" href={`#/catat?hari=${yesterday}`}>Catat</a>
          </div>
        )}
        {urgent.length > 0 && (
          <div className="alert">
            <div className="grow">
              <strong>{urgent.length} bahan perlu dibeli segera:</strong>{" "}
              {urgent.slice(0, 4).map((x) => x.name).join(", ")}{urgent.length > 4 ? ", …" : ""}
            </div>
            <a className="btn small" href="#/belanja">Daftar belanja</a>
          </div>
        )}
      </div>

      {empty ? (
        <div className="card pad empty">
          <h2>Belum ada penjualan di periode ini</h2>
          <p>Mulai dari <a href="#/menu">menu & resep</a>, lalu <a href="#/catat">catat penjualan</a> tiap hari.
            Prediksi muncul setelah sekitar seminggu data.</p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <div className="grid kpis">
            <Kpi label="Omzet" value={rupiah(d.kpi.revenue)} delta={d.kpi.revenue_change} />
            <Kpi label="Laba kotor (omzet − bahan)" value={rupiah(d.kpi.profit)} delta={d.kpi.profit_change} />
            <Kpi label="Porsi terjual" value={num(d.kpi.portions)} delta={d.kpi.portions_change} />
            <div className="card kpi">
              <div className="label">Rata-rata per hari buka</div>
              <div className="value num">{rupiahShort(d.kpi.avg_per_open_day)}</div>
              <div className="sub muted">{d.kpi.waste_cost > 0 ? `Bahan terbuang ${rupiahShort(d.kpi.waste_cost)}` : "Tidak ada bahan terbuang"}</div>
            </div>
          </div>

          <div className="grid two">
            <div className="card">
              <div className="card-head">
                <div><h2>Omzet harian</h2><p className="muted small">Warna menunjukkan ramai atau sepi dibanding hari yang sama biasanya</p></div>
              </div>
              <div className="card-body">
                <div style={{ height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={d.series} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--line)" />
                      <XAxis dataKey="date" tickFormatter={dayShort} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis tickFormatter={rupiahShort} tickLine={false} axisLine={false} width={64} />
                      <Tooltip cursor={{ fill: "var(--soft)" }} content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as Dashboard["series"][number];
                        return (
                          <div className="card pad small" style={{ padding: 10 }}>
                            <strong>{dayWithName(p.date)}</strong><br />
                            {p.closed ? `Tutup${p.note ? ` (${p.note})` : ""}` : !p.recorded ? "Belum dicatat" : <>
                              {rupiah(p.revenue)} · {num(p.portions)} porsi<br />
                              {p.level && <span className="muted">{LEVEL_LABEL[p.level]}</span>}
                            </>}
                          </div>
                        );
                      }} />
                      <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                        {d.series.map((p) => <Cell key={p.date} fill={p.level ? LEVEL_COLOR[p.level] : "var(--line)"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="legend" style={{ marginTop: 8 }}>
                  {(["ramai", "normal", "sepi"] as const).map((k) => <span key={k}><i style={{ background: LEVEL_COLOR[k] }} />{LEVEL_LABEL[k]}</span>)}
                </div>
              </div>
            </div>
            <NextWeek fc={fc.data} />
          </div>

          <div className="card">
            <div className="card-head"><div><h2>Menu</h2><p className="muted small">A = menyumbang 80% omzet pertama, C = paling sedikit</p></div></div>
            <div className="card-body table-wrap">
              <table>
                <thead><tr><th>Menu</th><th className="num">Terjual</th><th className="num">Omzet</th><th className="num">Margin</th><th>Kelas</th><th className="num">Tren</th></tr></thead>
                <tbody>
                  {d.items.map((x) => (
                    <tr key={x.id}>
                      <td>{x.name}{x.stockouts > 0 && <span className="badge warn" style={{ marginLeft: 6 }}>habis {x.stockouts}×</span>}
                        <div className="small muted">{CATEGORY_LABEL[x.category]}</div></td>
                      <td className="num">{num(x.qty)}</td>
                      <td className="num">{rupiahShort(x.revenue)}</td>
                      <td className="num">{pct(x.margin)}</td>
                      <td><span className={`badge ${x.abc === "A" ? "brand" : ""}`}>{x.abc}</span></td>
                      <td className={`num ${x.change === null ? "muted" : x.change >= 0 ? "up" : "down"}`}>
                        {x.change === null ? "–" : `${x.change >= 0 ? "▲" : "▼"} ${pct(Math.abs(x.change))}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid halves">
            <div className="card">
              <div className="card-head"><div><h2>Rata-rata omzet per hari</h2><p className="muted small">8 minggu terakhir, hari buka saja</p></div></div>
              <div className="card-body" style={{ height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={d.weekday} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="day" tickFormatter={(v: string) => v.slice(0, 3)} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={rupiahShort} tickLine={false} axisLine={false} width={64} />
                    <Tooltip formatter={(v) => rupiah(Number(v))} labelFormatter={(l) => String(l)} cursor={{ fill: "var(--soft)" }} />
                    <Bar dataKey="revenue" name="Omzet" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h2>Omzet per kategori</h2></div>
              <div className="card-body stack">
                {d.categories.map((c) => {
                  const share = c.revenue / Math.max(1, d.kpi.revenue);
                  return (
                    <div key={c.category}>
                      <div className="row"><span className="grow">{CATEGORY_LABEL[c.category]}</span>
                        <span className="num small">{rupiahShort(c.revenue)} · {pct(share)}</span></div>
                      <div className="bar"><i style={{ width: `${share * 100}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, delta }: { label: string; value: string; delta: number | null }) {
  const c = change(delta);
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value num">{value}</div>
      <div className={`sub ${c.cls}`}>{c.text}</div>
    </div>
  );
}

function NextWeek({ fc }: { fc: Forecast | null }) {
  if (!fc) return <div className="card pad"><Loading label="Menghitung prediksi…" /></div>;
  if (!fc.items.length) return <div className="card pad empty">Prediksi muncul setelah ada menu dan penjualan.</div>;
  const data = fc.dates.slice(0, 7).map((date, i) => ({
    date, lo: fc.totals.revenue[i][0], mid: fc.totals.revenue[i][1], hi: fc.totals.revenue[i][2],
    band: [fc.totals.revenue[i][0], fc.totals.revenue[i][2]], closed: fc.closed[i],
  }));
  const sum = data.reduce((a, x) => a + x.mid, 0);
  return (
    <div className="card">
      <div className="card-head">
        <div><h2>7 hari ke depan</h2><p className="muted small">Perkiraan omzet: sekitar <strong className="num">{rupiahShort(sum)}</strong></p></div>
        <a className="small" href="#/prediksi">Detail</a>
      </div>
      <div className="card-body" style={{ height: 240 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="date" tickFormatter={(v: string) => dayWithName(v).split(",")[0]} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={rupiahShort} tickLine={false} axisLine={false} width={64} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof data)[number];
              return <div className="card pad small" style={{ padding: 10 }}><strong>{dayWithName(p.date)}</strong><br />
                {p.closed ? "Tutup" : <>Sekitar {rupiah(p.mid)}<br /><span className="muted">kemungkinan {rupiahShort(p.lo)} – {rupiahShort(p.hi)}</span></>}</div>;
            }} />
            <Area dataKey="band" stroke="none" fill="var(--chart-band)" fillOpacity={0.7} isAnimationActive={false} />
            <Line dataKey="mid" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
